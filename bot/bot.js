require('dotenv').config();
const{Client,GatewayIntentBits,SlashCommandBuilder,REST,Routes,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const API=process.env.API_BASE_URL||'http://localhost:5000';
const GUILD_ID=process.env.GUILD_ID;
const CH_DASH=process.env.CHANNEL_DEADLINE_DASHBOARD;
const CH_ALERT=process.env.CHANNEL_DEADLINE_ALERTS;
const CH_STATS=process.env.CHANNEL_DEADLINE_STATS;
const PCOL={critical:0xed4245,high:0xfaa61a,medium:0x5865f2,low:0x57f287};
const PE={critical:'🔴',high:'🟠',medium:'🔵',low:'🟢'};
const SE={pending:'⏳','in-progress':'⚡',completed:'✅'};
const TE={closing:'🏠','loan-docs':'📄',inspection:'🔍',title:'📋',compliance:'⚖️',other:'📌'};

async function api(path,method='GET',body=null){
  try{
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(body)opts.body=JSON.stringify(body);
    const r=await fetch(API+path,opts);
    return r.json();
  }catch(e){return [];}
}

function formatDue(d){
  const now=new Date(),due=new Date(d),days=Math.ceil((due-now)/86400000);
  if(days<0)return '⚠️ **OVERDUE '+Math.abs(days)+'d ago**';
  if(days===0)return '🔥 **Due TODAY**';
  if(days===1)return '⏰ Due **tomorrow**';
  if(days<=3)return '🟡 Due in **'+days+' days**';
  return '📅 '+new Date(d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}

function buildDeadlineEmbed(d){
  const daysLeft=Math.ceil((new Date(d.dueDate)-new Date())/86400000);
  let color=PCOL[d.priority]||0x2d3150;
  if(daysLeft<0)color=0xed4245;
  else if(daysLeft===0)color=0xff6b35;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle((PE[d.priority]||'')+' '+d.title)
    .addFields(
      {name:'📌 Priority',value:d.priority.toUpperCase(),inline:true},
      {name:'👥 Team',value:d.team,inline:true},
      {name:'📊 Status',value:(SE[d.status]||'⏳')+' '+d.status,inline:true},
      {name:'🏷️ Type',value:(TE[d.type]||'📌')+' '+(d.type||'other'),inline:true},
      {name:'⏱️ Due',value:formatDue(d.dueDate),inline:true},
      ...(d.notes?[{name:'📝 Notes',value:d.notes,inline:false}]:[])
    )
    .setFooter({text:'ID: '+(d._id||d.id)+' • '+( d.createdBy||'team')})
    .setTimestamp(new Date(d.dueDate));
}

function buildDeadlineRow(id,status){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('complete_'+id).setLabel('✅ Complete').setStyle(ButtonStyle.Success).setDisabled(status==='completed'),
    new ButtonBuilder().setCustomId('inprogress_'+id).setLabel('⚡ In Progress').setStyle(ButtonStyle.Primary).setDisabled(status==='in-progress'),
    new ButtonBuilder().setCustomId('delete_'+id).setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger)
  );
}
async function refreshDashboard(){
  const ch=client.channels.cache.get(CH_DASH);
  if(!ch)return;
  const all=await api('/api/deadlines');
  const open=all.filter(d=>d.status!=='completed');
  const now=new Date();
  const overdue=open.filter(d=>new Date(d.dueDate)<now);
  const dueToday=open.filter(d=>{const days=Math.ceil((new Date(d.dueDate)-now)/86400000);return days>=0&&days<=0;});
  const dueSoon=open.filter(d=>{const days=Math.ceil((new Date(d.dueDate)-now)/86400000);return days>0&&days<=3;});
  open.sort((a,b)=>{
    const da=new Date(a.dueDate),db=new Date(b.dueDate);
    const pa={critical:0,high:1,medium:2,low:3};
    if(da<now&&db>=now)return -1;
    if(db<now&&da>=now)return 1;
    return da-db||pa[a.priority]-pa[b.priority];
  });
  const completed=all.filter(d=>d.status==='completed').length;
  let statusLine='';
  if(overdue.length>0)statusLine+='\n⚠️ **'+overdue.length+' OVERDUE** — needs immediate attention!';
  if(dueToday.length>0)statusLine+='\n🔥 **'+dueToday.length+' due TODAY**';
  if(dueSoon.length>0)statusLine+='\n⏰ **'+dueSoon.length+' due within 3 days**';
  const headerEmbed=new EmbedBuilder()
    .setColor(overdue.length>0?0xed4245:open.length>0?0xfaa61a:0x57f287)
    .setTitle('📋 BHAT Deadline Dashboard')
    .setDescription('**'+open.length+'** open · **'+completed+'** completed · Updated: <t:'+Math.floor(Date.now()/1000)+':R>'+statusLine)
    .addFields(
      {name:'🔴 Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
      {name:'🟠 High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
      {name:'🔵 Medium',value:String(open.filter(d=>d.priority==='medium').length),inline:true},
      {name:'🟢 Low',value:String(open.filter(d=>d.priority==='low').length),inline:true},
      {name:'👥 Frontend TC',value:String(open.filter(d=>d.team==='Frontend TC').length),inline:true},
      {name:'🔧 Backend TC',value:String(open.filter(d=>d.team==='Backend TC').length),inline:true}
    )
    .setFooter({text:'BHAT Deadline Manager • Auto-refreshes every 30 min'});
  const controlRow=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dash_add').setLabel('➕ Add Deadline').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dash_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dash_critical').setLabel('🔴 Critical Only').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dash_today').setLabel('🔥 Due Today').setStyle(ButtonStyle.Primary)
  );
  try{
    const msgs=await ch.messages.fetch({limit:50});
    const botMsgs=msgs.filter(m=>m.author.id===client.user.id);
    for(const [,msg] of botMsgs){await msg.delete().catch(()=>{});}
  }catch(e){}
  await ch.send({embeds:[headerEmbed],components:[controlRow]});
  if(open.length===0){
    await ch.send({content:'```\n✅  All caught up! No open deadlines.\n```'});
    return;
  }
  const groups=[
    {label:'🔴 CRITICAL — Immediate Action Required',items:open.filter(d=>d.priority==='critical')},
    {label:'🟠 HIGH PRIORITY',items:open.filter(d=>d.priority==='high')},
    {label:'🔵 MEDIUM PRIORITY',items:open.filter(d=>d.priority==='medium')},
    {label:'🟢 LOW PRIORITY',items:open.filter(d=>d.priority==='low')},
  ];
  for(const group of groups){
    if(group.items.length===0)continue;
    await ch.send({content:'**'+group.label+'**'});
    for(const d of group.items){
      const id=d._id||d.id;
      await ch.send({embeds:[buildDeadlineEmbed(d)],components:[buildDeadlineRow(id,d.status)]});
    }
  }
}

async function refreshStats(){
  const ch=client.channels.cache.get(CH_STATS);
  if(!ch)return;
  const all=await api('/api/deadlines');
  const open=all.filter(d=>d.status!=='completed');
  const now=new Date();
  const embed=new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 BHAT Transaction Stats')
    .setDescription('Updated <t:'+Math.floor(Date.now()/1000)+':R>')
    .addFields(
      {name:'📋 Total Open',value:String(open.length),inline:true},
      {name:'✅ Completed',value:String(all.length-open.length),inline:true},
      {name:'⚠️ Overdue',value:String(open.filter(d=>new Date(d.dueDate)<now).length),inline:true},
      {name:'🔴 Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
      {name:'🟠 High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
      {name:'🔵 Medium',value:String(open.filter(d=>d.priority==='medium').length),inline:true},
      {name:'👥 Frontend TC',value:String(open.filter(d=>d.team==='Frontend TC').length),inline:true},
      {name:'🔧 Backend TC',value:String(open.filter(d=>d.team==='Backend TC').length),inline:true},
      {name:'📅 Due This Week',value:String(open.filter(d=>{const days=Math.ceil((new Date(d.dueDate)-now)/86400000);return days>=0&&days<=7;}).length),inline:true}
    )
    .setFooter({text:'BHAT Deadline Manager'}).setTimestamp();
  try{
    const msgs=await ch.messages.fetch({limit:10});
    for(const [,msg] of msgs.filter(m=>m.author.id===client.user.id))await msg.delete().catch(()=>{});
  }catch(e){}
  await ch.send({embeds:[embed]});
}

async function alertCheck(){
  const ch=client.channels.cache.get(CH_ALERT);
  if(!ch)return;
  const all=await api('/api/deadlines');
  const now=new Date();
  const urgent=all.filter(d=>d.status!=='completed'&&new Date(d.dueDate)<=new Date(now.getTime()+86400000));
  if(!urgent.length)return;
  const embed=new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🚨 Deadline Alert — Action Needed')
    .setDescription('**'+urgent.length+'** deadline(s) need attention:')
    .addFields(urgent.slice(0,8).map(d=>({name:(PE[d.priority]||'')+' '+d.title,value:formatDue(d.dueDate)+' · '+d.team+' · '+(SE[d.status]||'')+' '+d.status})))
    .setTimestamp();
  await ch.send({content:'@here',embeds:[embed]});
}
function showAddModal(interaction){
  const modal=new ModalBuilder().setCustomId('modal_add').setTitle('📋 New Transaction Deadline');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Property / Transaction Title').setPlaceholder('456 Main St — Closing').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dueDate').setLabel('Due Date (MM/DD/YYYY HH:MM)').setPlaceholder('05/28/2026 17:00').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('priority').setLabel('Priority: critical / high / medium / low').setValue('high').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team').setLabel('Team: Frontend TC / Backend TC / Both').setValue('Frontend TC').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false))
  );
  return interaction.showModal(modal);
}

const cmds=[new SlashCommandBuilder()
  .setName('deadline')
  .setDescription('Manage BHAT transaction deadlines')
  .addSubcommand(s=>s.setName('add').setDescription('Add a new deadline'))
  .addSubcommand(s=>s.setName('list').setDescription('View open deadlines')
    .addStringOption(o=>o.setName('team').setDescription('Filter by team').addChoices({name:'Frontend TC',value:'Frontend TC'},{name:'Backend TC',value:'Backend TC'}))
    .addStringOption(o=>o.setName('priority').setDescription('Filter by priority').addChoices({name:'Critical',value:'critical'},{name:'High',value:'high'},{name:'Medium',value:'medium'},{name:'Low',value:'low'})))
  .addSubcommand(s=>s.setName('today').setDescription('Deadlines due today or overdue'))
  .addSubcommand(s=>s.setName('stats').setDescription('Deadline statistics'))
  .addSubcommand(s=>s.setName('dashboard').setDescription('Refresh the visual dashboard'))
  .toJSON()
];

client.once('ready',async()=>{
  console.log(client.user.tag+' online');
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,GUILD_ID),{body:cmds});
  console.log('Slash commands registered');
  await refreshDashboard();
  await refreshStats();
  setInterval(async()=>{
    await refreshDashboard();
    await refreshStats();
    await alertCheck();
  },30*60*1000);
});

client.on('interactionCreate',async interaction=>{
  if(interaction.isChatInputCommand()&&interaction.commandName==='deadline'){
    const sub=interaction.options.getSubcommand();
    if(sub==='add'){return showAddModal(interaction);}
    if(sub==='dashboard'){
      await interaction.deferReply({ephemeral:true});
      await refreshDashboard();
      await refreshStats();
      return interaction.editReply({content:'✅ Dashboard refreshed in <#'+CH_DASH+'>'});
    }
    if(sub==='list'){
      await interaction.deferReply();
      let dl=await api('/api/deadlines');
      dl=dl.filter(d=>d.status!=='completed');
      const tf=interaction.options.getString('team'),pf=interaction.options.getString('priority');
      if(tf)dl=dl.filter(d=>d.team===tf);
      if(pf)dl=dl.filter(d=>d.priority===pf);
      dl.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]-{critical:0,high:1,medium:2,low:3}[b.priority]||new Date(a.dueDate)-new Date(b.dueDate)));
      if(!dl.length)return interaction.editReply('✅ No open deadlines matching that filter.');
      await interaction.editReply('📋 **'+dl.length+' open deadline(s)**'+(tf?' — '+tf:'')+(pf?' — '+pf:''));
      for(const d of dl.slice(0,8)){const id=d._id||d.id;await interaction.followUp({embeds:[buildDeadlineEmbed(d)],components:[buildDeadlineRow(id,d.status)]});}
    }
    if(sub==='today'){
      await interaction.deferReply();
      const all=await api('/api/deadlines'),now=new Date();
      const urgent=all.filter(d=>d.status!=='completed'&&new Date(d.dueDate)<=new Date(now.getTime()+86400000));
      if(!urgent.length)return interaction.editReply('✅ Nothing due in the next 24 hours.');
      await interaction.editReply('🚨 **'+urgent.length+' deadline(s) need attention:**');
      for(const d of urgent){const id=d._id||d.id;await interaction.followUp({embeds:[buildDeadlineEmbed(d)],components:[buildDeadlineRow(id,d.status)]});}
    }
    if(sub==='stats'){
      await interaction.deferReply();
      const all=await api('/api/deadlines'),open=all.filter(d=>d.status!=='completed'),now=new Date();
      const embed=new EmbedBuilder().setColor(0x5865f2).setTitle('📊 BHAT Deadline Stats')
        .setDescription('**'+open.length+'** open · **'+(all.length-open.length)+'** completed')
        .addFields(
          {name:'🔴 Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
          {name:'🟠 High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
          {name:'🔵 Medium',value:String(open.filter(d=>d.priority==='medium').length),inline:true},
          {name:'🟢 Low',value:String(open.filter(d=>d.priority==='low').length),inline:true},
          {name:'⚠️ Overdue',value:String(open.filter(d=>new Date(d.dueDate)<now).length),inline:true},
          {name:'👥 Frontend TC',value:String(open.filter(d=>d.team==='Frontend TC').length),inline:true}
        ).setTimestamp();
      return interaction.editReply({embeds:[embed]});
    }
  }
  if(interaction.isButton()){
    const parts=interaction.customId.split('_');
    const action=parts[0];
    if(action==='dash'){
      const sub=parts[1];
      if(sub==='add'){return showAddModal(interaction);}
      if(sub==='refresh'){
        await interaction.deferReply({ephemeral:true});
        await refreshDashboard();
        await refreshStats();
        return interaction.editReply({content:'✅ Dashboard refreshed!'});
      }
      if(sub==='critical'){
        await interaction.deferReply({ephemeral:true});
        let dl=await api('/api/deadlines');
        dl=dl.filter(d=>d.status!=='completed'&&d.priority==='critical');
        if(!dl.length)return interaction.editReply({content:'✅ No critical deadlines right now.'});
        await interaction.editReply({content:'🔴 **'+dl.length+' critical deadline(s):**'});
        for(const d of dl.slice(0,5)){const id=d._id||d.id;await interaction.followUp({embeds:[buildDeadlineEmbed(d)],components:[buildDeadlineRow(id,d.status)],ephemeral:true});}
        return;
      }
      if(sub==='today'){
        await interaction.deferReply({ephemeral:true});
        let dl=await api('/api/deadlines');
        const now=new Date();
        dl=dl.filter(d=>d.status!=='completed'&&new Date(d.dueDate)<=new Date(now.getTime()+86400000));
        if(!dl.length)return interaction.editReply({content:'✅ Nothing due in the next 24 hours.'});
        await interaction.editReply({content:'🔥 **'+dl.length+' due today/overdue:**'});
        for(const d of dl.slice(0,5)){const id=d._id||d.id;await interaction.followUp({embeds:[buildDeadlineEmbed(d)],components:[buildDeadlineRow(id,d.status)],ephemeral:true});}
        return;
      }
    }
    const id=parts.slice(1).join('_');
    await interaction.deferUpdate();
    if(action==='complete'){
      const u=await api('/api/deadlines/'+id,'PUT',{status:'completed'});
      const uid=u._id||u.id;
      await interaction.editReply({embeds:[buildDeadlineEmbed(u)],components:[buildDeadlineRow(uid,u.status)]});
      const ch=client.channels.cache.get(CH_DASH);
      if(ch)await ch.send({content:'✅ **'+u.title+'** marked complete by <@'+interaction.user.id+'>'});
      setTimeout(()=>refreshDashboard(),2000);
    }
    if(action==='inprogress'){
      const u=await api('/api/deadlines/'+id,'PUT',{status:'in-progress'});
      const uid=u._id||u.id;
      await interaction.editReply({embeds:[buildDeadlineEmbed(u)],components:[buildDeadlineRow(uid,u.status)]});
      setTimeout(()=>refreshDashboard(),2000);
    }
    if(action==='delete'){
      await api('/api/deadlines/'+id,'DELETE');
      await interaction.editReply({content:'🗑️ Deleted by <@'+interaction.user.id+'>',embeds:[],components:[]});
      setTimeout(()=>refreshDashboard(),2000);
    }
  }
  if(interaction.isModalSubmit()&&interaction.customId==='modal_add'){
    await interaction.deferReply({ephemeral:true});
    const title=interaction.fields.getTextInputValue('title');
    const dueDateRaw=interaction.fields.getTextInputValue('dueDate');
    const priority=interaction.fields.getTextInputValue('priority').toLowerCase().trim();
    const team=interaction.fields.getTextInputValue('team').trim();
    const notes=interaction.fields.getTextInputValue('notes')||'';
    const dueDate=new Date(dueDateRaw);
    if(isNaN(dueDate))return interaction.editReply({content:'❌ Invalid date. Use MM/DD/YYYY HH:MM'});
    if(!['critical','high','medium','low'].includes(priority))return interaction.editReply({content:'❌ Priority must be: critical, high, medium, or low'});
    const created=await api('/api/deadlines','POST',{title,dueDate:dueDate.toISOString(),priority,team,notes,status:'pending',createdBy:interaction.user.username});
    await interaction.editReply({content:'✅ Deadline created! Dashboard is updating...'});
    setTimeout(()=>refreshDashboard(),1500);
    setTimeout(()=>refreshStats(),2000);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
