/** PokeIdle Online — servidor independente sem dependências externas. Node 20+. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname,'data');
const FILE = path.join(DATA_DIR,'game.json');
const PUBLIC = path.join(__dirname,'public');
const NOW = () => Date.now();
const MAX_CHAT = 60;
fs.mkdirSync(DATA_DIR,{recursive:true});
const zones = [
  {id:'praia',name:'Praia de Melemele',level:1,x:32,y:47,subtitle:'Marés calmas e primeiros encontros',type:'Água',mobs:[10,16,19,21,25,43,54]},
  {id:'selva',name:'Selva de Akala',level:3,x:47,y:42,subtitle:'Trilhas e criaturas selvagens',type:'Planta',mobs:[1,10,43,46,69,123,152]},
  {id:'cidade',name:'Hau’oli',level:6,x:22,y:47,subtitle:'Ruínas e caminhos da cidade',type:'Normal',mobs:[16,19,25,52,58,133,143]},
  {id:'vulcao',name:'Vulcão Wela',level:10,x:62,y:42,subtitle:'Calor e Pokémon do fogo',type:'Fogo',mobs:[4,37,58,77,126,155,218]},
  {id:'caverna',name:'Caverna Secreta',level:15,x:57,y:61,subtitle:'Tesouros e raridades',type:'Pedra',mobs:[41,74,92,95,111,147,246]},
  {id:'deserto',name:'Deserto de Ula’ula',level:21,x:79,y:52,subtitle:'Batalhas difíceis nas areias',type:'Terra',mobs:[27,50,74,104,111,246,443]},
  {id:'montanha',name:'Montanha Lanakila',level:29,x:55,y:85,subtitle:'Neve e poder extremo',type:'Gelo',mobs:[37,86,87,131,144,215,361]},
  {id:'santuario',name:'Santuário Lendário',level:40,x:77,y:83,subtitle:'O maior desafio da região',type:'Lendário',mobs:[94,131,143,149,150,249,384]},
];
const species = [
 [1,'Bulbasaur','Planta'],[2,'Ivysaur','Planta'],[3,'Venusaur','Planta'],[4,'Charmander','Fogo'],[5,'Charmeleon','Fogo'],[6,'Charizard','Fogo'],[7,'Squirtle','Água'],[8,'Wartortle','Água'],[9,'Blastoise','Água'],
 [10,'Caterpie','Inseto'],[16,'Pidgey','Normal'],[19,'Rattata','Normal'],[21,'Spearow','Normal'],[25,'Pikachu','Elétrico'],[27,'Sandshrew','Terra'],[37,'Vulpix','Fogo'],[41,'Zubat','Venenoso'],[43,'Oddish','Planta'],[46,'Paras','Inseto'],[50,'Diglett','Terra'],[52,'Meowth','Normal'],[54,'Psyduck','Água'],[58,'Growlithe','Fogo'],[69,'Bellsprout','Planta'],[74,'Geodude','Pedra'],[77,'Ponyta','Fogo'],[86,'Seel','Água'],[87,'Dewgong','Gelo'],[92,'Gastly','Fantasma'],[94,'Gengar','Fantasma'],[95,'Onix','Pedra'],[104,'Cubone','Terra'],[111,'Rhyhorn','Terra'],[123,'Scyther','Inseto'],[126,'Magmar','Fogo'],[131,'Lapras','Água'],[133,'Eevee','Normal'],[143,'Snorlax','Normal'],[144,'Articuno','Gelo'],[147,'Dratini','Dragão'],[149,'Dragonite','Dragão'],[150,'Mewtwo','Psíquico'],[152,'Chikorita','Planta'],[155,'Cyndaquil','Fogo'],[215,'Sneasel','Sombrio'],[218,'Slugma','Fogo'],[246,'Larvitar','Pedra'],[249,'Lugia','Psíquico'],[361,'Snorunt','Gelo'],[384,'Rayquaza','Dragão'],[443,'Gible','Dragão']
].map(([id,name,type])=>({id,name,type}));
const dex=Object.fromEntries(species.map(p=>[p.id,p]));
const evolutions={1:[2,16],2:[3,32],4:[5,16],5:[6,36],7:[8,16],8:[9,36]};
const baseStore={users:{},sessions:{},chat:[],seq:0};
let store=baseStore;
try { const fromDisk=JSON.parse(fs.readFileSync(FILE,'utf8')); store={...baseStore,...fromDisk};} catch(e) {if(e.code!=='ENOENT') console.error('Falha lendo save:',e.message)}
let saving=false, dirty=false;
function save(){if(saving){dirty=true;return;} saving=true; try{const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(store));fs.renameSync(tmp,FILE);dirty=false;}catch(e){console.error('Falha gravando save:',e.message)}finally{saving=false}}
setInterval(()=>{if(dirty)save();},10000).unref();
function mark(){dirty=true;}
function random(n){return crypto.randomInt(n);}
function xpRequired(level){return 100 + level*level*26;}
function calcMaxHp(level){return 50 + level*6;}
function makePokemon(id,level,shiny=false){return {uid:crypto.randomUUID(),species:id,level,shiny,hp:calcMaxHp(level),maxHp:calcMaxHp(level)};}
function newUser(nickname,guest=false,passwordHash=null,salt=null){
 const id=crypto.randomUUID();const user={id,nickname,guest,passwordHash,salt,created:NOW(),lastSeen:NOW(),level:1,xp:0,gold:350,balls:15,stardust:0,kills:0,captures:0,wins:0,hunting:null,lastTick:NOW(),zone:'praia',pokemon:[],active:null,feed:[],lastChat:0,lastBoss:0};store.users[id]=user;mark();return user;
}
function issueSession(user,res,req){const token=crypto.randomBytes(32).toString('hex');store.sessions[crypto.createHash('sha256').update(token).digest('hex')]={id:user.id,expires:NOW()+30*24*3600000};
 const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';res.setHeader('Set-Cookie',`pid_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*86400}${secure?'; Secure':''}`);mark();}
function userFrom(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pid_session='))?.slice(12);if(!token)return null;const hashed=crypto.createHash('sha256').update(token).digest('hex'); const session=store.sessions[hashed];if(!session||session.expires<NOW())return null;return store.users[session.id]||null;}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function fail(res,msg,status=400){json(res,{error:msg},status)}
function sanitizeName(v){return String(v||'').trim().replace(/\s+/g,' ').slice(0,20)}
function hashPassword(password,salt){return crypto.scryptSync(password,salt,64).toString('hex')}
function verifyPassword(password,user){if(!user.passwordHash||!user.salt)return false;let hash;try{hash=Buffer.from(hashPassword(password,user.salt),'hex')}catch{return false}const saved=Buffer.from(user.passwordHash,'hex');return hash.length===saved.length&&crypto.timingSafeEqual(hash,saved)}
function event(u,text){u.feed.unshift({at:NOW(),text});u.feed=u.feed.slice(0,35)}
function awardXp(u,amount){u.xp+=amount; while(u.xp>=xpRequired(u.level)){u.xp-=xpRequired(u.level);u.level++;u.balls+=2;u.gold+=u.level*15;event(u,`⭐ Subiu para o nível ${u.level}! +2 Pokébolas`);}}
function huntTick(u){if(!u.hunting)return;const elapsed=NOW()-u.lastTick;const interval=2900;const ticks=Math.min(600,Math.floor(Math.max(0,elapsed)/interval));if(!ticks)return;
 u.lastTick+=ticks*interval;const z=zones.find(z=>z.id===u.hunting);if(!z){u.hunting=null;return;}
 for(let i=0;i<ticks;i++){
   const id=z.mobs[random(z.mobs.length)];u.kills++;const xp=Math.floor(20+z.level*5+random(14));const gold=5+Math.floor(z.level*1.4)+random(10);awardXp(u,xp);u.gold+=gold;
   if(random(100)<9)u.balls=Math.min(999,u.balls+1);
   if(random(1000)<9){u.stardust++;event(u,`✨ Fragmento raro encontrado em ${z.name}!`)}
   if(u.balls>0&&random(100)<19){u.balls--;if(random(100)<72){const shiny=random(2048)===0;
      if(u.pokemon.length<150){const poke=makePokemon(id,Math.min(80,z.level+random(6)),shiny);u.pokemon.push(poke);u.captures++;if(shiny||u.captures<=5||u.captures%10===0)event(u,`🎯 Capturou ${shiny?'✨ Shiny ':''}${dex[id]?.name||'Pokémon'} nível ${poke.level}!`);}
      else u.gold+=20;
   }}
 }
 if(ticks>=60)event(u,`⚔️ Caça: +${ticks} batalhas, +moedas e experiência`);
 mark();
}
function state(u){huntTick(u);u.lastSeen=NOW();mark();const online=Object.values(store.users).filter(x=>x.lastSeen>NOW()-120000).length; return {me:publicUser(u),online,leaders:leaderboard(),chat:store.chat.slice(-32),zones,species};}
function publicUser(u){return {id:u.id,nickname:u.nickname,guest:u.guest,level:u.level,xp:u.xp,xpNext:xpRequired(u.level),gold:u.gold,balls:u.balls,stardust:u.stardust,kills:u.kills,captures:u.captures,wins:u.wins,hunting:u.hunting,zone:u.zone,pokemon:u.pokemon,active:u.active,feed:u.feed};}
function leaderboard(){return Object.values(store.users).map(({id,nickname,level,kills,captures,wins,lastSeen})=>({id,nickname,level,kills,captures,wins,online:lastSeen>NOW()-120000})).sort((a,b)=>b.level-a.level||b.kills-a.kills).slice(0,15)}
async function readBody(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>16000)throw Error('Pedido muito grande')}try{return JSON.parse(data||'{}')}catch{throw Error('Dados inválidos')}}
function corsGuard(req,res){if(!['POST','GET','HEAD'].includes(req.method))return false; const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host)return false}catch{return false}}return true;}
async function handleAPI(req,res,route){
 if(!corsGuard(req,res))return fail(res,'Origem ou método não permitido',403);
 const u=userFrom(req);let body={};if(req.method==='POST'){try{body=await readBody(req)}catch(e){return fail(res,e.message)}}
 if(route==='/api/health')return json(res,{ok:true,version:'1.0.0',players:Object.keys(store.users).length});
 if(route==='/api/guest'&&req.method==='POST'){
   if(u)return json(res,state(u));const name=sanitizeName(body.nickname)||`Treinador${random(9000)+1000}`;
   const user=newUser(name,true);issueSession(user,res,req);save();return json(res,state(user),201);
 }
 if(route==='/api/register'&&req.method==='POST'){
   const name=sanitizeName(body.nickname),password=String(body.password||'');if(name.length<3||name.length>20||!(/^[\p{L}\p{N}_ -]+$/u.test(name)))return fail(res,'Apelido de 3 a 20 caracteres (letras, números, espaço, _ ou -)');
   if(password.length<8||password.length>128)return fail(res,'Senha deve ter de 8 a 128 caracteres');
   if(Object.values(store.users).some(x=>!x.guest&&x.nickname.toLowerCase()===name.toLowerCase()))return fail(res,'Esse apelido já existe',409);
   if(u&&u.guest){u.nickname=name;u.guest=false;u.salt=crypto.randomBytes(16).toString('hex');u.passwordHash=hashPassword(password,u.salt);mark();save();return json(res,state(u));}
   const salt=crypto.randomBytes(16).toString('hex');const user=newUser(name,false,hashPassword(password,salt),salt);issueSession(user,res,req);save();return json(res,state(user),201);
 }
 if(route==='/api/login'&&req.method==='POST'){
   const user=Object.values(store.users).find(x=>!x.guest&&x.nickname.toLowerCase()===sanitizeName(body.nickname).toLowerCase());if(!user||!verifyPassword(String(body.password||''),user))return fail(res,'Usuário ou senha incorretos',401);
   issueSession(user,res,req);save();return json(res,state(user));
 }
 if(route==='/api/logout'&&req.method==='POST'){
   const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pid_session='))?.slice(12);if(token)delete store.sessions[crypto.createHash('sha256').update(token).digest('hex')];res.setHeader('Set-Cookie','pid_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');mark();return json(res,{ok:true});
 }
 if(!u)return fail(res,'Sessão necessária',401);
 if(route==='/api/state'&&req.method==='GET')return json(res,state(u));
 huntTick(u);
 if(route==='/api/starter'&&req.method==='POST'){
   if(u.pokemon.length)return fail(res,'Você já escolheu seu Pokémon inicial');const id=Number(body.species);if(![1,4,7].includes(id))return fail(res,'Escolha Bulbasaur, Charmander ou Squirtle');const poke=makePokemon(id,5);u.pokemon.push(poke);u.active=poke.uid;event(u,`🎉 Seu parceiro é ${dex[id].name}! Boa jornada!`);
 }
 else if(route==='/api/travel'&&req.method==='POST'){
   const z=zones.find(x=>x.id===body.zone);if(!z)return fail(res,'Região inválida');if(u.level<z.level)return fail(res,`Nível ${z.level} necessário`);u.zone=z.id;u.hunting=null;event(u,`🗺️ Chegou a ${z.name}`);
 }
 else if(route==='/api/hunt/start'&&req.method==='POST'){
   if(!u.active)return fail(res,'Escolha um Pokémon inicial');const z=zones.find(x=>x.id===u.zone);if(u.level<z.level)return fail(res,'Região bloqueada');u.hunting=z.id;u.lastTick=NOW();event(u,`⚔️ Começou a caçar em ${z.name}`);
 }
 else if(route==='/api/hunt/stop'&&req.method==='POST'){u.hunting=null;event(u,'⏹️ Caça interrompida');}
 else if(route==='/api/team/active'&&req.method==='POST'){
   const poke=u.pokemon.find(p=>p.uid===body.uid);if(!poke)return fail(res,'Pokémon não encontrado');u.active=poke.uid;event(u,`🐾 ${dex[poke.species]?.name} virou seu parceiro principal`);
 }
 else if(route==='/api/team/train'&&req.method==='POST'){
   const poke=u.pokemon.find(p=>p.uid===body.uid);if(!poke)return fail(res,'Pokémon não encontrado');if(poke.level>=100)return fail(res,'Pokémon já atingiu o nível máximo');const cost=50+poke.level*22;if(u.gold<cost)return fail(res,`Você precisa de ${cost} moedas`);u.gold-=cost;poke.level++;poke.maxHp=calcMaxHp(poke.level);poke.hp=poke.maxHp;event(u,`💪 ${dex[poke.species]?.name} treinou para nível ${poke.level}`);
 }
 else if(route==='/api/team/evolve'&&req.method==='POST'){
   const poke=u.pokemon.find(p=>p.uid===body.uid),ev=poke&&evolutions[poke.species];if(!poke||!ev)return fail(res,'Esse Pokémon não tem evolução disponível');if(poke.level<ev[1])return fail(res,`Nível ${ev[1]} necessário`);if(u.stardust<3)return fail(res,'Você precisa de 3 fragmentos raros');u.stardust-=3;poke.species=ev[0];poke.maxHp=calcMaxHp(poke.level)+20;poke.hp=poke.maxHp;event(u,`🌟 Evoluiu para ${dex[poke.species]?.name}!`);
 }
 else if(route==='/api/shop/balls'&&req.method==='POST'){
   if(u.gold<150)return fail(res,'Você precisa de 150 moedas');u.gold-=150;u.balls+=10;event(u,'🎒 Comprou 10 Pokébolas');
 }
 else if(route==='/api/boss'&&req.method==='POST'){
   if(!u.active)return fail(res,'Você precisa de um Pokémon inicial');if(NOW()-u.lastBoss<35000)return fail(res,`Recarga do chefe: ${Math.ceil((35000-(NOW()-u.lastBoss))/1000)}s`);
   u.lastBoss=NOW();const poke=u.pokemon.find(p=>p.uid===u.active);const z=zones.find(x=>x.id===u.zone),power=poke.level*2+u.level+random(25),enemy=z.level*3+20+random(24);
   if(power>=enemy){const gold=160+z.level*15,exp=120+z.level*12;u.gold+=gold;awardXp(u,exp);u.wins++;event(u,`🏆 Venceu o chefe de ${z.name}! +${gold} ouro`)}
   else{event(u,`💥 O chefe venceu! Treine seu Pokémon para uma revanche`)}
 }
 else if(route==='/api/chat'&&req.method==='POST'){
   const msg=String(body.message||'').replace(/[<>]/g,'').trim().slice(0,180);if(msg.length<2)return fail(res,'Mensagem muito curta');if(NOW()-u.lastChat<4000)return fail(res,'Aguarde 4 segundos para falar novamente');u.lastChat=NOW();store.chat.push({id:crypto.randomUUID(),nickname:u.nickname,message:msg,at:NOW(),level:u.level});store.chat=store.chat.slice(-MAX_CHAT);
 }
 else return fail(res,'Rota não encontrada',404);
 mark();return json(res,state(u));
}
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
function staticFile(req,res,route){
 let urlPath=route==='/'?'/index.html':route;try{urlPath=decodeURIComponent(urlPath)}catch{return fail(res,'URL inválida')}
 const file=path.resolve(PUBLIC,'.'+urlPath);if(file!==PUBLIC&&!file.startsWith(PUBLIC+path.sep))return fail(res,'Não permitido',403);
 fs.stat(file,(e,stat)=>{if(e||!stat.isFile())return fail(res,'Arquivo não encontrado',404);
 const ext=path.extname(file);res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600','Content-Security-Policy':"default-src 'self'; img-src 'self' https://raw.githubusercontent.com data:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"}); fs.createReadStream(file).pipe(res);
 });
}
const server=http.createServer(async(req,res)=>{
 try{const route=new URL(req.url,'http://localhost').pathname;
 if(route.startsWith('/api/'))return await handleAPI(req,res,route);
 if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,'Método não permitido',405);
 return staticFile(req,res,route);
 }catch(e){console.error(e);return fail(res,'Erro interno',500)}
});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{save();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref()});
server.listen(PORT,'0.0.0.0',()=>console.log(`PokeIdle Online disponível em http://localhost:${PORT}`));
