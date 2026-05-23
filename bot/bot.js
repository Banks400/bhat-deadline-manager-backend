require('dotenv').config();
const{Client,GatewayIntentBits,SlashCommandBuilder,REST,Routes,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const API=process.env.API_BASE_URL||'http://localhost:3000';
const GUILD_ID=process.env.GUILD_ID;
const CH_DASH=process.env.CHANNEL_DEADLINE_DASHBOARD;
const CH_ALERT=process.env.CHANNEL_DEADLINE_ALERTS;
const CH_STATS=process.env.CHANNEL_DEADLINE_STATS;
const COLORS={critical:0xED4245,high:0xFAA61A,medium:0x5865F2,low:0x57F287,complete:0x2D3148,header:0x23272A,alert:0xFEE75C,success:0x57F287};
const PBADGE={critical:'🔴 CRITICAL',high:'🟠 HIGH',medium:'🔵 MEDIUM',low:'🟢 LOW'};
const SBADGE={pending:'⏳ Pending','in-progress':'⚡ In Progress',completed:'✅ Complete'};
const TICON={closing:'🏠','loan-docs':'📄',inspection:'🔍',title:'📋',compliance:'⚖️',contingency:'📌',appraisal:'🏗️',walkthrough:'👁️',other:'📎'};
const TBADGE={'Frontend TC':'👤 Frontend TC','Backend TC':'⚙️ Backend TC','Both':'👥 Both'};

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

function daysUntil(d){return Math.ceil((new Date(d)-new Date())/86400000);}

function formatDue(d){
  const days=daysUntil(d);
  const dt=new Date(d);
  const ds=dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const ts=dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  if(days<0)return '🚨 OVERDUE '+Math.abs(days)+'d ago ('+ds+')';
  if(days===0)return '🔥 TODAY at '+ts;
  if(days===1)return '⏰ TOMORROW at '+ts;
  if(days<=3)return '🟡 In '+days+' days — '+ds;
  if(days<=7)return '📅 '+ds+' ('+days+'d)';
  return '📆 '+ds;
}

function urgBar(days){
  if(days<0)return '🟥🟥🟥🟥🟥 OVERDUE';
  if(days===0)return '🟧🟧🟧🟧⬜ TODAY';
  if(days===1)return '🟨🟨🟨⬜⬜ TOMORROW';
  if(days<=3)return '🟩🟩🟩⬜⬜ '+days+'d left';
  if(days<=7)return '🟩🟩⬜⬜⬜ '+days+'d left';
  return '🟩⬜⬜⬜⬜ '+days+'d left';
}
function buildCard(d){
  const days=daysUntil(d.dueDate);
  const id=d._id||d.id;
  let color=COLORS[d.priority]||COLORS.medium;
  if(days<0)color=COLORS.critical;
  else if(days===0)color=0xFF6B35;
  const icon=TICON[d.type]||'📎';
  let desc='> '+formatDue(d.dueDate);
  if(d.address)desc+='\n> 📍 '+d.address;
  if(d.agent)desc+='\n> 🤝 Agent: **'+d.agent+'**';
  if(d.closePrice)desc+='\n> 💰 Price: '+d.closePrice;
  const fields=[
    {name:'🎯 Priority',value:PBADGE[d.priority]||d.priority,inline:true},
    {name:'👥 Team',value:TBADGE[d.team]||d.team,inline:true},
    {name:'📊 Status',value:SBADGE[d.status]||d.status,inline:true},
    {name:'🏷️ Task Type',value:icon+' '+(d.type||'other'),inline:true},
    {name:'⏱️ Urgency',value:urgBar(days),inline:false},
  ];
  if(d.fileNumber)fields.push({name:'📁 File #',value:d.fileNumber,inline:true});
  if(d.mlsNumber)fields.push({name:'🔑 MLS #',value:d.mlsNumber,inline:true});
  if(d.notes)fields.push({name:'📝 Notes',value:d.notes.substring(0,200),inline:false});
  const footer='ID: '+id+(d.source?' • 🔗 via '+d.source:'')+(d.createdBy?' • added by '+d.createdBy:'');
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(icon+' '+d.title)
    .setDescription(desc)
    .addFields(...fields)
    .setFooter({text:footer})
    .setTimestamp(new Date(d.dueDate));
}

function buildRow(id,status){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('txn_complete_'+id).setLabel('✅ Mark Complete').setStyle(ButtonStyle.Success).setDisabled(status==='completed'),
    new ButtonBuilder().setCustomId('txn_active_'+id).setLabel('⚡ In Progress').setStyle(ButtonStyle.Primary).setDisabled(status==='in-progress'),
    new ButtonBuilder().setCustomId('txn_delete_'+id).setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger)
  );
}
async function refreshDashboard(){
  const ch=client.channels.cache.get(CH_DASH);
  if(!ch)return;
  const all=await api('/api/deadlines');
  if(!all)return;
  const open=all.filter(d=>d.status!=='completed');
  const done=all.filter(d=>d.status==='completed');
  const now=new Date();
  const overdue=open.filter(d=>new Date(d.dueDate)<now);
  const today=open.filter(d=>{const dy=daysUntil(d.dueDate);return dy>=0&&dy<1;});
  const soon=open.filter(d=>{const dy=daysUntil(d.dueDate);return dy>=1&&dy<=3;});
  open.sort((a,b)=>{
    const pri={critical:0,high:1,medium:2,low:3};
    const da=new Date(a.dueDate),db=new Date(b.dueDate);
    if(da<now&&db>=now)return -1;
    if(db<now&&da>=now)return 1;
    return da-db||pri[a.priority]-pri[b.priority];
  });

  // Build status line
  let statusParts=[];
  if(overdue.length)statusParts.push('🚨 **'+overdue.length+' OVERDUE**');
  if(today.length)statusParts.push('🔥 **'+today.length+' due TODAY**');
  if(soon.length)statusParts.push('⏰ **'+soon.length+' due within 3 days**');
  const statusLine=statusParts.length?statusParts.join(' · '):'🟢 All transactions on track';

  // Build progress bar
  const total=all.length;
  const pct=total>0?Math.round((done.length/total)*100):0;
  const filled=Math.round(pct/10);
  const bar='█'.repeat(filled)+'░'.repeat(10-filled);

  // Header embed
  const urgColor=overdue.length?COLORS.critical:today.length?0xFF6B35:open.length?COLORS.high:COLORS.success;
  const headerEmbed=new EmbedBuilder()
    .setColor(urgColor)
    .setTitle('📋  B Holmes & Associates — Transaction Deadline Board')
    .setDescription(
      statusLine+'\n\n'+
      '**Progress:** '+bar+' '+pct+'% complete ('+done.length+'/'+total+' transactions)\n'+
      'Last synced: <t:'+Math.floor(Date.now()/1000)+':R> · Auto-refreshes every 30 min'
    )
    .addFields(
      {name:'🔴  Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
      {name:'🟠  High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
      {name:'🔵  Medium',value:String(open.filter(d=>d.priority==='medium').length),inline:true},
      {name:'🟢  Low',value:String(open.filter(d=>d.priority==='low').length),inline:true},
      {name:'👤  Frontend TC',value:String(open.filter(d=>d.team==='Frontend TC').length),inline:true},
      {name:'⚙️  Backend TC',value:String(open.filter(d=>d.team==='Backend TC').length),inline:true},
      {name:'🏠  Closings',value:String(open.filter(d=>d.type==='closing').length),inline:true},
      {name:'📄  Loan Docs',value:String(open.filter(d=>d.type==='loan-docs').length),inline:true},
      {name:'🔍  Inspections',value:String(open.filter(d=>d.type==='inspection').length),inline:true}
    )
    .setFooter({text:'BHAT Transaction Coordinator System • Powered by BHAT Bot'})
    .setThumbnail('https://i.imgur.com/vVwIGLZ.png');

  const controlRow=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dash_add').setLabel('➕ New Deadline').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dash_refresh').setLabel('🔄 Sync Now').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dash_overdue').setLabel('🚨 Overdue').setStyle(ButtonStyle.Danger).setDisabled(overdue.length===0),
    new ButtonBuilder().setCustomId('dash_today').setLabel('🔥 Today').setStyle(ButtonStyle.Primary).setDisabled(today.length===0)
  );

  // Clear old bot messages
  try{
    const msgs=await ch.messages.fetch({limit:50});
    for(const [,m] of msgs.filter(m=>m.author.id===client.user.id))await m.delete().catch(()=>{});
  }catch(e){}

  await ch.send({embeds:[headerEmbed],components:[controlRow]});

  if(open.length===0){
    const clearEmbed=new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('✅  No Active Deadlines')
      .setDescription('All transaction deadlines are complete or the board is empty.\n\nUse **➕ New Deadline** above or `/deadline add` to log a new transaction task.');
    await ch.send({embeds:[clearEmbed]});
    return;
  }

  // Section dividers + cards by priority
  const groups=[
    {emoji:'🚨',label:'OVERDUE — Immediate Action Required',items:open.filter(d=>daysUntil(d.dueDate)<0),urgent:true},
    {emoji:'🔥',label:'DUE TODAY',items:open.filter(d=>{const dy=daysUntil(d.dueDate);return dy>=0&&dy<1;}),urgent:true},
    {emoji:'⏰',label:'DUE WITHIN 3 DAYS',items:open.filter(d=>{const dy=daysUntil(d.dueDate);return dy>=1&&dy<=3;}),urgent:false},
    {emoji:'🔴',label:'CRITICAL PRIORITY',items:open.filter(d=>d.priority==='critical'&&daysUntil(d.dueDate)>3),urgent:false},
    {emoji:'🟠',label:'HIGH PRIORITY',items:open.filter(d=>d.priority==='high'&&daysUntil(d.dueDate)>3),urgent:false},
    {emoji:'🔵',label:'MEDIUM PRIORITY',items:open.filter(d=>d.priority==='medium'&&daysUntil(d.dueDate)>3),urgent:false},
    {emoji:'🟢',label:'LOW PRIORITY',items:open.filter(d=>d.priority==='low'&&daysUntil(d.dueDate)>3),urgent:false},
  ];

  for(const group of groups){
    if(!group.items.length)continue;
    const divider=group.urgent
      ?'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      :'──────────────────────────────';
    await ch.send({content:divider+'\n'+group.emoji+' **'+group.label+'** ('+group.items.length+')'});
    for(const d of group.items){
      const id=d._id||d.id;
      await ch.send({embeds:[buildCard(d)],components:[buildRow(id,d.status)]});
    }
  }
}
async function refreshStats(){
  const ch=client.channels.cache.get(CH_STATS);
  if(!ch)return;
  const all=await api('/api/deadlines');
  if(!all)return;
  const open=all.filter(d=>d.status!=='completed');
  const done=all.filter(d=>d.status==='completed');
  const now=new Date();
  const overdue=open.filter(d=>new Date(d.dueDate)<now);
  const thisWeek=open.filter(d=>{const dy=daysUntil(d.dueDate);return dy>=0&&dy<=7;});
  const pct=all.length?Math.round((done.length/all.length)*100):0;
  const filled=Math.round(pct/10);
  const bar='█'.repeat(filled)+'░'.repeat(10-filled)+' '+pct+'%';
  const embed=new EmbedBuilder()
    .setColor(overdue.length?COLORS.critical:COLORS.info)
    .setTitle('📊  BHAT Transaction Performance Dashboard')
    .setDescription('Weekly snapshot · Updated <t:'+Math.floor(Date.now()/1000)+':R>\n**Completion:** '+bar)
    .addFields(
      {name:'📋  Open Transactions',value:String(open.length),inline:true},
      {name:'✅  Completed',value:String(done.length),inline:true},
      {name:'⚠️  Overdue',value:overdue.length?'**'+String(overdue.length)+'** ⚠️':String(overdue.length),inline:true},
      {name:'🔴  Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
      {name:'🟠  High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
      {name:'📅  Due This Week',value:String(thisWeek.length),inline:true},
      {name:'👤  Frontend TC Load',value:String(open.filter(d=>d.team==='Frontend TC').length)+' open',inline:true},
      {name:'⚙️  Backend TC Load',value:String(open.filter(d=>d.team==='Backend TC').length)+' open',inline:true},
      {name:'🔗  Nekst Synced',value:String(all.filter(d=>d.source==='nekst').length)+' items',inline:true},
      {name:'🏠  Closings',value:String(open.filter(d=>d.type==='closing').length),inline:true},
      {name:'📄  Loan Docs',value:String(open.filter(d=>d.type==='loan-docs').length),inline:true},
      {name:'🔍  Inspections',value:String(open.filter(d=>d.type==='inspection').length),inline:true}
    )
    .setFooter({text:'BHAT TC System • Auto-refreshes every 30 min'})
    .setTimestamp();
  try{
    const msgs=await ch.messages.fetch({limit:10});
    for(const [,m] of msgs.filter(m=>m.author.id===client.user.id))await m.delete().catch(()=>{});
  }catch(e){}
  await ch.send({embeds:[embed]});
}

async function alertCheck(){
  const ch=client.channels.cache.get(CH_ALERT);
  if(!ch)return;
  const all=await api('/api/deadlines');
  if(!all)return;
  const now=new Date();
  const urgent=all.filter(d=>d.status!=='completed'&&new Date(d.dueDate)<=new Date(now.getTime()+86400000));
  if(!urgent.length)return;
  const overdue=urgent.filter(d=>new Date(d.dueDate)<now);
  const embed=new EmbedBuilder()
    .setColor(overdue.length?COLORS.critical:0xFF6B35)
    .setTitle((overdue.length?'🚨':'⏰')+' BHAT Deadline Alert — Action Required')
    .setDescription('**'+urgent.length+'** transaction deadline'+(urgent.length===1?' requires':'s require')+' immediate attention:')
    .addFields(urgent.slice(0,8).map(d=>({
      name:(TICON[d.type]||'📎')+' '+d.title,
      value:formatDue(d.dueDate)+' · '+TBADGE[d.team]+' · '+SBADGE[d.status]
    })))
    .setFooter({text:'Check #deadline-dashboard for full details and action buttons'})
    .setTimestamp();
  await ch.send({content:'@here',embeds:[embed]});
}
function showAddModal(interaction){
  const modal=new ModalBuilder().setCustomId('modal_add').setTitle('📋 New Transaction Deadline');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Property Address / Transaction Name').setPlaceholder('123 Oak St — Closing / Loan Docs / Inspection').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dueDate').setLabel('Due Date & Time (MM/DD/YYYY HH:MM)').setPlaceholder('05/30/2026 17:00').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('typeAndPriority').setLabel('Type | Priority (e.g. closing|high)').setPlaceholder('closing|critical  or  inspection|high  or  loan-docs|medium').setValue('closing|high').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team').setLabel('Assigned Team').setPlaceholder('Frontend TC / Backend TC / Both').setValue('Frontend TC').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / Agent / File # (optional)').setPlaceholder('Agent: Jane Smith | File: 2026-0512 | Notes here').setStyle(TextInputStyle.Paragraph).setRequired(false))
  );
  return interaction.showModal(modal);
}

const cmds=[new SlashCommandBuilder()
  .setName('deadline').setDescription('BHAT Transaction Deadline Manager')
  .addSubcommand(s=>s.setName('add').setDescription('Log a new transaction deadline'))
  .addSubcommand(s=>s.setName('list').setDescription('View open deadlines')
    .addStringOption(o=>o.setName('team').setDescription('Filter by team').addChoices({name:'Frontend TC',value:'Frontend TC'},{name:'Backend TC',value:'Backend TC'}))
    .addStringOption(o=>o.setName('priority').setDescription('Filter by priority').addChoices({name:'Critical',value:'critical'},{name:'High',value:'high'},{name:'Medium',value:'medium'},{name:'Low',value:'low'}))
    .addStringOption(o=>o.setName('type').setDescription('Filter by type').addChoices({name:'Closing',value:'closing'},{name:'Loan Docs',value:'loan-docs'},{name:'Inspection',value:'inspection'},{name:'Title',value:'title'},{name:'Compliance',value:'compliance'})))
  .addSubcommand(s=>s.setName('today').setDescription('Deadlines due today or overdue'))
  .addSubcommand(s=>s.setName('stats').setDescription('Transaction performance stats'))
  .addSubcommand(s=>s.setName('dashboard').setDescription('Rebuild the visual dashboard now'))
  .addSubcommand(s=>s.setName('search').setDescription('Search deadlines by property/address')
    .addStringOption(o=>o.setName('query').setDescription('Property name or address').setRequired(true)))
  .toJSON()
];
client.once('ready',async()=>{
  console.log('\n=================================');
  console.log(' BHAT Bot Online: '+client.user.tag);
  console.log(' API: '+API);
  console.log('=================================\n');
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,GUILD_ID),{body:cmds});
  console.log('Slash commands registered');
  await refreshDashboard();
  await refreshStats();
  setInterval(async()=>{
    console.log('['+new Date().toLocaleTimeString()+'] Auto-refresh triggered');
    await refreshDashboard();
    await refreshStats();
    await alertCheck();
  },30*60*1000);
});

client.on('interactionCreate',async interaction=>{
  if(interaction.isChatInputCommand()&&interaction.commandName==='deadline'){
    const sub=interaction.options.getSubcommand();
    if(sub==='add')return showAddModal(interaction);
    if(sub==='dashboard'){
      await interaction.deferReply({ephemeral:true});
      await refreshDashboard();await refreshStats();
      return interaction.editReply({content:'✅ Dashboard rebuilt in <#'+CH_DASH+'>'});
    }
    if(sub==='list'){
      await interaction.deferReply();
      let dl=await api('/api/deadlines');
      if(!dl)return interaction.editReply('❌ Could not reach backend API.');
      dl=dl.filter(d=>d.status!=='completed');
      const tf=interaction.options.getString('team');
      const pf=interaction.options.getString('priority');
      const tyf=interaction.options.getString('type');
      if(tf)dl=dl.filter(d=>d.team===tf);
      if(pf)dl=dl.filter(d=>d.priority===pf);
      if(tyf)dl=dl.filter(d=>d.type===tyf);
      dl.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]-{critical:0,high:1,medium:2,low:3}[b.priority]||new Date(a.dueDate)-new Date(b.dueDate)));
      if(!dl.length)return interaction.editReply('✅ No open deadlines match that filter.');
      await interaction.editReply('📋 **'+dl.length+' open deadline(s)**'+(tf?' · '+tf:'')+(pf?' · '+pf:'')+(tyf?' · '+tyf:''));
      for(const d of dl.slice(0,6)){const id=d._id||d.id;await interaction.followUp({embeds:[buildCard(d)],components:[buildRow(id,d.status)]});}
    }
    if(sub==='today'){
      await interaction.deferReply();
      const all=await api('/api/deadlines');
      if(!all)return interaction.editReply('❌ Could not reach backend API.');
      const urgent=all.filter(d=>d.status!=='completed'&&daysUntil(d.dueDate)<=1);
      if(!urgent.length)return interaction.editReply('✅ Nothing urgent in the next 24 hours. Great work!');
      await interaction.editReply('🚨 **'+urgent.length+' deadline(s) need attention now:**');
      for(const d of urgent){const id=d._id||d.id;await interaction.followUp({embeds:[buildCard(d)],components:[buildRow(id,d.status)]});}
    }
    if(sub==='stats'){
      await interaction.deferReply();
      const all=await api('/api/deadlines');
      if(!all)return interaction.editReply('❌ Could not reach backend API.');
      const open=all.filter(d=>d.status!=='completed');
      const now=new Date();
      const embed=new EmbedBuilder().setColor(COLORS.info).setTitle('📊 BHAT Transaction Stats')
        .setDescription('**'+open.length+'** open · **'+(all.length-open.length)+'** completed')
        .addFields(
          {name:'🔴 Critical',value:String(open.filter(d=>d.priority==='critical').length),inline:true},
          {name:'🟠 High',value:String(open.filter(d=>d.priority==='high').length),inline:true},
          {name:'⚠️ Overdue',value:String(open.filter(d=>new Date(d.dueDate)<now).length),inline:true},
          {name:'👤 Frontend TC',value:String(open.filter(d=>d.team==='Frontend TC').length),inline:true},
          {name:'⚙️ Backend TC',value:String(open.filter(d=>d.team==='Backend TC').length),inline:true},
          {name:'🏠 Closings',value:String(open.filter(d=>d.type==='closing').length),inline:true}
        ).setTimestamp();
      return interaction.editReply({embeds:[embed]});
    }
    if(sub==='search'){
      await interaction.deferReply();
      const q=interaction.options.getString('query').toLowerCase();
      const all=await api('/api/deadlines');
      if(!all)return interaction.editReply('❌ Could not reach backend API.');
      const results=all.filter(d=>d.title.toLowerCase().includes(q)||(d.address&&d.address.toLowerCase().includes(q))||(d.notes&&d.notes.toLowerCase().includes(q)));
      if(!results.length)return interaction.editReply('🔍 No transactions found matching: **'+q+'**');
      await interaction.editReply('🔍 **'+results.length+' result(s)** for: **'+q+'**');
      for(const d of results.slice(0,5)){const id=d._id||d.id;await interaction.followUp({embeds:[buildCard(d)],components:[buildRow(id,d.status)]});}
    }
  }
  if(interaction.isButton()){
    const parts=interaction.customId.split('_');
    const ns=parts[0];
    if(ns==='dash'){
      const act=parts[1];
      if(act==='add')return showAddModal(interaction);
      if(act==='refresh'){
        await interaction.deferReply({ephemeral:true});
        await refreshDashboard();await refreshStats();
        return interaction.editReply({content:'✅ Dashboard synced!'});
      }
      if(act==='overdue'||act==='today'){
        await interaction.deferReply({ephemeral:true});
        const all=await api('/api/deadlines');
        const now=new Date();
        let filtered=all?all.filter(d=>d.status!=='completed'):[];
        if(act==='overdue')filtered=filtered.filter(d=>new Date(d.dueDate)<now);
        else filtered=filtered.filter(d=>daysUntil(d.dueDate)<=1&&daysUntil(d.dueDate)>=0);
        if(!filtered.length)return interaction.editReply({content:'✅ Nothing in that category right now.'});
        await interaction.editReply({content:'Found **'+filtered.length+'** item(s):'});
        for(const d of filtered.slice(0,5)){const id=d._id||d.id;await interaction.followUp({embeds:[buildCard(d)],components:[buildRow(id,d.status)],ephemeral:true});}
        return;
      }
    }
    if(ns==='txn'){
      const act=parts[1];
      const id=parts.slice(2).join('_');
      await interaction.deferUpdate();
      if(act==='complete'){
        const u=await api('/api/deadlines/'+id,'PUT',{status:'completed'});
        if(!u)return interaction.editReply({content:'❌ Could not update. Check backend.',embeds:[],components:[]});
        const uid=u._id||u.id;
        await interaction.editReply({embeds:[buildCard(u)],components:[buildRow(uid,u.status)]});
        const ch=client.channels.cache.get(CH_DASH);
        if(ch)await ch.send({content:'✅ **'+u.title+'** marked complete by <@'+interaction.user.id+'> <t:'+Math.floor(Date.now()/1000)+':R>'});
        setTimeout(()=>{refreshDashboard();refreshStats();},2000);
      }
      if(act==='active'){
        const u=await api('/api/deadlines/'+id,'PUT',{status:'in-progress'});
        if(!u)return;
        const uid=u._id||u.id;
        await interaction.editReply({embeds:[buildCard(u)],components:[buildRow(uid,u.status)]});
        setTimeout(()=>{refreshDashboard();},2000);
      }
      if(act==='delete'){
        await api('/api/deadlines/'+id,'DELETE');
        await interaction.editReply({content:'🗑️ Deadline removed by <@'+interaction.user.id+'>',embeds:[],components:[]});
        setTimeout(()=>{refreshDashboard();refreshStats();},2000);
      }
    }
  }

  if(interaction.isModalSubmit()&&interaction.customId==='modal_add'){
    await interaction.deferReply({ephemeral:true});
    const title=interaction.fields.getTextInputValue('title');
    const dueDateRaw=interaction.fields.getTextInputValue('dueDate');
    const typeAndPriority=interaction.fields.getTextInputValue('typeAndPriority').toLowerCase().trim();
    const team=interaction.fields.getTextInputValue('team').trim();
    const notesRaw=interaction.fields.getTextInputValue('notes')||'';
    const dueDate=new Date(dueDateRaw);
    if(isNaN(dueDate))return interaction.editReply({content:'❌ Invalid date. Use MM/DD/YYYY HH:MM format'});
    const parts=typeAndPriority.split('|').map(s=>s.trim());
    const type=parts[0]||'other';
    const priority=parts[1]||'medium';
    if(!['critical','high','medium','low'].includes(priority))return interaction.editReply({content:'❌ Priority must be critical, high, medium, or low'});
    // Parse optional notes fields
    let notes=notesRaw,agent='',fileNumber='';
    const agentMatch=notesRaw.match(/agent:\s*([^|\n]+)/i);
    const fileMatch=notesRaw.match(/file[#:\s]+([^|\n]+)/i);
    if(agentMatch)agent=agentMatch[1].trim();
    if(fileMatch)fileNumber=fileMatch[1].trim();
    const created=await api('/api/deadlines','POST',{title,dueDate:dueDate.toISOString(),priority,team,type,notes,agent,fileNumber,status:'pending',createdBy:interaction.user.username,source:'manual'});
    if(!created)return interaction.editReply({content:'❌ Failed to create deadline. Is the backend running?'});
    await interaction.editReply({content:'✅ **'+title+'** added to the dashboard!\nDue: '+formatDue(dueDate.toISOString())});
    setTimeout(()=>{refreshDashboard();refreshStats();},1500);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
