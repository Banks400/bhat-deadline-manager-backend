require('dotenv').config();
const{Client,GatewayIntentBits,SlashCommandBuilder,REST,Routes,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionFlagsBits}=require('discord.js');

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const API=process.env.API_BASE_URL||'http://localhost:3000';
const GUILD_ID=process.env.GUILD_ID;
const CH_STATUS=process.env.CHANNEL_TC_STATUS;
const CH_TASKS=process.env.CHANNEL_TASKS||process.env.CHANNEL_DEADLINE_DASHBOARD;

// Workload thresholds
const LOAD={AVAILABLE:4,BUSY:7}; // <4 = Available, 4-7 = Busy, >7 = At Capacity

// Connectivity status stored in memory (refreshes each check-in)
const connectivity={};

async function api(path,method,body){
  method=method||'GET';body=body||null;
  try{
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(body)opts.body=JSON.stringify(body);
    const r=await fetch(API+path,opts);
    if(!r.ok)return null;
    return r.json();
  }catch(e){return null;}
}

function getAvailability(total,urgent){
  if(total>=LOAD.BUSY)return{label:'🔴 At Capacity',color:0xED4245,advice:'Cannot take new transactions'};
  if(total>=LOAD.AVAILABLE||urgent>=2)return{label:'🟡 Busy',color:0xFAA61A,advice:'Can take transactions if needed'};
  return{label:'🟢 Available',color:0x57F287,advice:'Ready for new transactions'};
}

function getConnectivity(userId){
  const c=connectivity[userId];
  if(!c)return{label:'⬜ Not checked in',color:0x4F545C};
  const mins=Math.floor((Date.now()-c.time)/60000);
  const age=mins<60?mins+'m ago':Math.floor(mins/60)+'h ago';
  return{label:c.label+' ('+age+')',color:c.color,speed:c.speed||null};
}

// ─── STATUS BOARD ─────────────────────────────────────────────────────────────
async function refreshStatusBoard(){
  const ch=client.channels.cache.get(CH_STATUS);
  if(!ch)return;

  const[workload,frontendQ,backendQ]=await Promise.all([
    api('/api/transactions/workload'),
    api('/api/transactions/queue/Frontend%20TC'),
    api('/api/transactions/queue/Backend%20TC')
  ]);

  const load=workload||[];
  const fq=frontendQ||{members:[],nextUp:null};
  const bq=backendQ||{members:[],nextUp:null};

  // Build per-TC cards
  const allMembers=[...fq.members.map(m=>({...m,team:'Frontend TC'})),...bq.members.map(m=>({...m,team:'Backend TC'}))];
  const fields=[];

  for(const member of allMembers){
    const wl=load.find(w=>w.userId===member.userId)||{total:0,urgent:0,closingThisWeek:0};
    const avail=getAvailability(wl.total,wl.urgent);
    const conn=getConnectivity(member.userId);
    const isNextFE=fq.nextUp&&fq.nextUp.userId===member.userId;
    const isNextBE=bq.nextUp&&bq.nextUp.userId===member.userId;
    const nextTag=(isNextFE||isNextBE)?'  **[NEXT UP]**':'';
    fields.push({
      name:member.team==='Frontend TC'?'👤 '+member.displayName+' — Frontend TC'+nextTag:'⚙️ '+member.displayName+' — Backend TC'+nextTag,
      value:
        avail.label+'  '+conn.label+'\n'+
        '📂 **'+wl.total+'** active  ·  🏠 **'+wl.closingThisWeek+'** closing this week  ·  🚨 **'+wl.urgent+'** urgent\n'+
        (conn.speed?'📶 '+conn.speed+'\n':'')+'_'+avail.advice+'_',
      inline:false
    });
  }

  if(!fields.length){
    fields.push({name:'No TCs registered',value:'Use `/tc register` to add TC members to their rotation queues.',inline:false});
  }

  // Next up section
  const nextLine=
    '**Frontend TC next:** '+(fq.nextUp?fq.nextUp.displayName||fq.nextUp.username:'None registered')+
    '  ·  **Backend TC next:** '+(bq.nextUp?bq.nextUp.displayName||bq.nextUp.username:'None registered');

  const embed=new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('👥  BHAT TC Team Status Board')
    .setDescription(
      'Live workload & availability for all active Transaction Coordinators\n'+
      'Updated: <t:'+Math.floor(Date.now()/1000)+':R>\n\n'+
      '**Next Transaction Assignment:**\n'+nextLine
    )
    .addFields(...fields)
    .setFooter({text:'BHAT TC System • Updates on /transaction new and check-ins'});

  // Control row
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_checkin').setLabel('📶 Check In').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tc_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_queue').setLabel('📋 View Queue').setStyle(ButtonStyle.Primary)
  );

  try{
    const msgs=await ch.messages.fetch({limit:10});
    for(const[,m]of msgs.filter(m=>m.author.id===client.user.id))await m.delete().catch(()=>{});
  }catch(e){}
  await ch.send({embeds:[embed],components:[row]});
}
// ─── SLASH COMMANDS ──────────────────────────────────────────────────────────
const cmds=[
  // /transaction new — add a new transaction to the rotation queue
  new SlashCommandBuilder()
    .setName('transaction')
    .setDescription('Manage BHAT transactions')
    .addSubcommand(s=>s.setName('new').setDescription('Add a new transaction — auto-assigns to next TC in rotation'))
    .addSubcommand(s=>s.setName('list').setDescription('View active transactions')
      .addStringOption(o=>o.setName('team').setDescription('Filter by team').addChoices({name:'Frontend TC',value:'Frontend TC'},{name:'Backend TC',value:'Backend TC'})))
    .addSubcommand(s=>s.setName('close').setDescription('Mark a transaction as closed')
      .addStringOption(o=>o.setName('id').setDescription('Transaction ID').setRequired(true)))
    .addSubcommand(s=>s.setName('status').setDescription('Update transaction stage')
      .addStringOption(o=>o.setName('id').setDescription('Transaction ID').setRequired(true))
      .addStringOption(o=>o.setName('stage').setDescription('New stage').setRequired(true).addChoices(
        {name:'New Contract',value:'new-contract'},
        {name:'Setup',value:'setup'},
        {name:'Active Management',value:'active-management'},
        {name:'Pre-Closing',value:'pre-closing'},
        {name:'Closing',value:'closing'},
        {name:'Post-Close',value:'post-close'}
      )))
    .toJSON(),

  // /tc — manage TC roster and view status
  new SlashCommandBuilder()
    .setName('tc')
    .setDescription('TC team management')
    .addSubcommand(s=>s.setName('board').setDescription('Show the live TC status board'))
    .addSubcommand(s=>s.setName('checkin').setDescription('Check in for the day + report connectivity'))
    .addSubcommand(s=>s.setName('register').setDescription('Register a TC member to a rotation queue (Admin only)')
      .addUserOption(o=>o.setName('user').setDescription('TC member').setRequired(true))
      .addStringOption(o=>o.setName('team').setDescription('Which queue').setRequired(true).addChoices({name:'Frontend TC',value:'Frontend TC'},{name:'Backend TC',value:'Backend TC'})))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove TC from rotation queue (Admin only)')
      .addUserOption(o=>o.setName('user').setDescription('TC member').setRequired(true))
      .addStringOption(o=>o.setName('team').setDescription('Which queue').setRequired(true).addChoices({name:'Frontend TC',value:'Frontend TC'},{name:'Backend TC',value:'Backend TC'})))
    .addSubcommand(s=>s.setName('queue').setDescription('Show current rotation queue order'))
    .toJSON()
];

// ─── BOT READY ───────────────────────────────────────────────────────────────
client.once('ready',async()=>{
  console.log('\n=================================');
  console.log(' BHAT TC Tracker: '+client.user.tag);
  console.log('=================================\n');
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,GUILD_ID),{body:cmds});
  console.log('TC Tracker commands registered');
  // Initial board post
  setTimeout(()=>refreshStatusBoard(),3000);
  // Refresh every 15 minutes
  setInterval(()=>refreshStatusBoard(),15*60*1000);
});
// ─── INTERACTIONS ────────────────────────────────────────────────────────────
client.on('interactionCreate',async interaction=>{

  // ── /transaction commands ──
  if(interaction.isChatInputCommand()&&interaction.commandName==='transaction'){
    const sub=interaction.options.getSubcommand();

    if(sub==='new'){
      // Show modal to collect transaction details
      const modal=new ModalBuilder().setCustomId('modal_txn_new').setTitle('New Transaction');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('address').setLabel('Property Address').setPlaceholder('123 Oak Street, Austin TX 78701').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team').setLabel('Assign to Team: Frontend TC / Backend TC').setValue('Frontend TC').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('closeDate').setLabel('Expected Close Date (MM/DD/YYYY)').setPlaceholder('06/15/2026').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('agent').setLabel('Agent Name').setPlaceholder('Jane Smith').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('MLS # | File # | Price (optional)').setPlaceholder('MLS: 1234567 | File: 2026-001 | Price: $450k').setStyle(TextInputStyle.Short).setRequired(false))
      );
      return interaction.showModal(modal);
    }

    if(sub==='list'){
      await interaction.deferReply();
      const team=interaction.options.getString('team');
      const url='/api/transactions?status=active'+(team?'&team='+encodeURIComponent(team):'');
      const txns=await api(url);
      if(!txns||!txns.length)return interaction.editReply('✅ No active transactions'+(team?' for '+team:'')+'.');
      const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('📂 Active Transactions'+(team?' — '+team:''))
        .setDescription('**'+txns.length+'** active transaction(s)');
      for(const t of txns.slice(0,10)){
        const days=t.closeDate?Math.ceil((new Date(t.closeDate)-new Date())/86400000):null;
        const dueStr=days!==null?(days<0?'🚨 OVERDUE':days===0?'🔥 TODAY':days+'d'):' No close date';
        embed.addFields({name:'🏠 '+t.address,value:'👤 '+t.assignedName+' · '+t.stage+' · '+dueStr+(t.agent?' · Agent: '+t.agent:''),inline:false});
      }
      return interaction.editReply({embeds:[embed]});
    }

    if(sub==='close'){
      await interaction.deferReply({ephemeral:true});
      const id=interaction.options.getString('id');
      const result=await api('/api/transactions/'+id,'PUT',{status:'closed',closedAt:new Date()});
      if(!result)return interaction.editReply({content:'❌ Transaction not found or API error.'});
      await interaction.editReply({content:'✅ **'+result.address+'** marked as closed!'});
      setTimeout(()=>refreshStatusBoard(),1500);
    }

    if(sub==='status'){
      await interaction.deferReply({ephemeral:true});
      const id=interaction.options.getString('id');
      const stage=interaction.options.getString('stage');
      const result=await api('/api/transactions/'+id,'PUT',{stage});
      if(!result)return interaction.editReply({content:'❌ Transaction not found.'});
      await interaction.editReply({content:'✅ **'+result.address+'** updated to stage: **'+stage+'**'});
    }
  }

  // ── /tc commands ──
  if(interaction.isChatInputCommand()&&interaction.commandName==='tc'){
    const sub=interaction.options.getSubcommand();

    if(sub==='board'){
      await interaction.deferReply({ephemeral:true});
      await refreshStatusBoard();
      return interaction.editReply({content:'✅ Status board refreshed in <#'+CH_STATUS+'>'});
    }

    if(sub==='checkin'){
      // Show connectivity check buttons
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('conn_excellent').setLabel('📶 Excellent (50+ Mbps)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('conn_good').setLabel('📶 Good (20-50 Mbps)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('conn_fair').setLabel('📶 Fair (5-20 Mbps)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('conn_poor').setLabel('🔴 Poor (<5 Mbps)').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({
        content:'👋 Good day! How is your connection right now?\nThis updates the team status board so everyone knows you are ready.',
        components:[row],
        ephemeral:true
      });
    }

    if(sub==='register'){
      if(!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({content:'❌ Admin only.',ephemeral:true});
      await interaction.deferReply({ephemeral:true});
      const user=interaction.options.getUser('user');
      const team=interaction.options.getString('team');
      const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
      const displayName=member?member.displayName:user.username;
      const result=await api('/api/transactions/queue/register','POST',{
        guildId:GUILD_ID,team,userId:user.id,username:user.username,displayName
      });
      if(!result)return interaction.editReply({content:'❌ Could not register. Is the backend running?'});
      await interaction.editReply({content:'✅ **'+displayName+'** added to the **'+team+'** rotation queue!'});
      setTimeout(()=>refreshStatusBoard(),1500);
    }

    if(sub==='remove'){
      if(!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({content:'❌ Admin only.',ephemeral:true});
      await interaction.deferReply({ephemeral:true});
      const user=interaction.options.getUser('user');
      const team=interaction.options.getString('team');
      const result=await api('/api/transactions/queue/'+encodeURIComponent(team)+'/'+user.id,'DELETE');
      if(!result)return interaction.editReply({content:'❌ Could not remove.'});
      await interaction.editReply({content:'✅ **'+user.username+'** removed from **'+team+'** queue.'});
      setTimeout(()=>refreshStatusBoard(),1500);
    }

    if(sub==='queue'){
      await interaction.deferReply({ephemeral:true});
      const[fq,bq]=await Promise.all([api('/api/transactions/queue/Frontend%20TC'),api('/api/transactions/queue/Backend%20TC')]);
      const fList=(fq&&fq.members.length)?fq.members.map((m,i)=>(i===fq.currentIndex?'**→ '+m.displayName+'** (next)':m.displayName)).join('\n'):'No members';
      const bList=(bq&&bq.members.length)?bq.members.map((m,i)=>(i===bq.currentIndex?'**→ '+m.displayName+'** (next)':m.displayName)).join('\n'):'No members';
      const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('📋 TC Rotation Queues')
        .addFields({name:'👤 Frontend TC Queue',value:fList,inline:true},{name:'⚙️ Backend TC Queue',value:bList,inline:true});
      return interaction.editReply({embeds:[embed]});
    }
  }

  // ── Button interactions ──
  if(interaction.isButton()){
    const id=interaction.customId;

    // Connectivity check-in buttons
    if(id.startsWith('conn_')){
      const connMap={
        conn_excellent:{label:'📶📶📶📶📶 Excellent',color:0x57F287,speed:'50+ Mbps'},
        conn_good:{label:'📶📶📶📶 Good',color:0x5865F2,speed:'20-50 Mbps'},
        conn_fair:{label:'📶📶📶 Fair',color:0xFAA61A,speed:'5-20 Mbps'},
        conn_poor:{label:'📶 Poor',color:0xED4245,speed:'<5 Mbps'},
      };
      const c=connMap[id];
      if(c){
        connectivity[interaction.user.id]={...c,time:Date.now(),userId:interaction.user.id,username:interaction.user.username};
        await interaction.update({
          content:'✅ Checked in! Your status: **'+c.label+'** ('+c.speed+')\nThe team status board has been updated.',
          components:[]
        });
        // Post check-in notification to tasks channel
        const taskCh=client.channels.cache.get(CH_TASKS);
        if(taskCh)await taskCh.send({content:'👋 **'+interaction.user.displayName+'** checked in · '+c.label+' · '+c.speed+' · <t:'+Math.floor(Date.now()/1000)+':t>'});
        setTimeout(()=>refreshStatusBoard(),1000);
      }
    }

    if(id==='tc_checkin'){
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('conn_excellent').setLabel('📶 Excellent (50+ Mbps)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('conn_good').setLabel('📶 Good (20-50 Mbps)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('conn_fair').setLabel('📶 Fair (5-20 Mbps)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('conn_poor').setLabel('🔴 Poor (<5 Mbps)').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({content:'👋 How is your connection today?',components:[row],ephemeral:true});
    }

    if(id==='tc_refresh'){
      await interaction.deferReply({ephemeral:true});
      await refreshStatusBoard();
      return interaction.editReply({content:'✅ Board refreshed!'});
    }

    if(id==='tc_queue'){
      await interaction.deferReply({ephemeral:true});
      const[fq,bq]=await Promise.all([api('/api/transactions/queue/Frontend%20TC'),api('/api/transactions/queue/Backend%20TC')]);
      const fNext=fq&&fq.nextUp?fq.nextUp.displayName||fq.nextUp.username:'None';
      const bNext=bq&&bq.nextUp?bq.nextUp.displayName||bq.nextUp.username:'None';
      return interaction.editReply({content:'📋 **Next up:**\n👤 Frontend TC: **'+fNext+'**\n⚙️ Backend TC: **'+bNext+'**'});
    }
  }

  // ── Modal: new transaction submitted ──
  if(interaction.isModalSubmit()&&interaction.customId==='modal_txn_new'){
    await interaction.deferReply({ephemeral:true});
    const address=interaction.fields.getTextInputValue('address');
    const teamRaw=interaction.fields.getTextInputValue('team').trim();
    const closeDateRaw=interaction.fields.getTextInputValue('closeDate');
    const agent=interaction.fields.getTextInputValue('agent');
    const details=interaction.fields.getTextInputValue('details');
    const team=['Frontend TC','Backend TC'].includes(teamRaw)?teamRaw:'Frontend TC';
    const closeDate=closeDateRaw?new Date(closeDateRaw):null;
    // Parse optional details field
    const mlsMatch=details.match(/MLS[:#\s]+([\w-]+)/i);
    const fileMatch=details.match(/File[:#\s]+([\w-]+)/i);
    const priceMatch=details.match(/Price[:#\s]+([\S]+)/i);
    const result=await api('/api/transactions','POST',{
      address,tcTeam:team,
      closeDate:closeDate?closeDate.toISOString():null,
      agent,
      mlsNumber:mlsMatch?mlsMatch[1]:'',
      fileNumber:fileMatch?fileMatch[1]:'',
      closePrice:priceMatch?priceMatch[1]:'',
      addedBy:interaction.user.username,
      guildId:GUILD_ID
    });
    if(!result||!result.transaction)
      return interaction.editReply({content:'❌ '+((result&&result.error)||'Failed to create transaction. Check backend or run /tc register first.')});
    const txn=result.transaction;
    const assignee=result.assignedTo;
    // Confirm assignment
    const embed=new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Transaction Added & Assigned')
      .setDescription('**'+address+'** has been added to the **'+team+'** rotation.')
      .addFields(
        {name:'🏠 Property',value:address,inline:true},
        {name:'👤 Assigned To',value:assignee.displayName||assignee.username,inline:true},
        {name:'👥 Team',value:team,inline:true},
        {name:'📅 Close Date',value:closeDate?closeDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set',inline:true},
        {name:'🤝 Agent',value:agent||'Not specified',inline:true},
        {name:'📁 Transaction ID',value:String(txn._id||txn.id),inline:false}
      )
      .setFooter({text:'Added by '+interaction.user.username});
    await interaction.editReply({embeds:[embed]});
    // Announce in tasks channel
    const taskCh=client.channels.cache.get(CH_TASKS);
    if(taskCh)await taskCh.send({
      content:'📂 New transaction assigned to <@'+assignee.userId+'>',
      embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🏠 '+address).setDescription('Assigned to **'+(assignee.displayName||assignee.username)+'** · **'+team+'**').addFields({name:'📅 Close Date',value:closeDate?closeDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'TBD',inline:true},{name:'🤝 Agent',value:agent||'TBD',inline:true})]
    });
    // Refresh status board
    setTimeout(()=>refreshStatusBoard(),1500);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
