import http from "node:http";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 10000);
const DATA = "./sales-agent-data.json";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const CITIES = ["Sétif", "El Eulma"];
const CATEGORIES = ["clothing","restaurant","cafe","cosmetics","gym","real_estate","electronics","local_company","ecommerce"];

const ID = () => crypto.randomUUID();
async function load() {
  try { return JSON.parse(await fs.readFile(DATA, "utf8")); }
  catch { const d={leads:[],outreach:[],audits:[],settings:{cities:CITIES,categories:CATEGORIES}}; await save(d); return d; }
}
async function save(d){ await fs.writeFile(DATA, JSON.stringify(d,null,2)); }
function send(res,status,data,type="application/json"){res.writeHead(status,{"content-type":type+"; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS","access-control-allow-headers":"content-type"});res.end(type==="text/html"?data:JSON.stringify(data));}
async function reqBody(req){let s="";for await(const c of req)s+=c;return s?JSON.parse(s):{};}

function heuristic(l){
  let score=0,reasons=[];
  if(!l.website){score+=20;reasons.push("لا يوجد موقع واضح");}
  if(l.websiteWeak||l.websiteOutdated){score+=10;reasons.push("الموقع يحتاج تحسين");}
  if(l.socialActive){score+=10;reasons.push("وجود نشاط اجتماعي");}
  if(l.ecommercePotential){score+=15;reasons.push("إمكانية بيع إلكتروني");}
  if(l.weakCreative){score+=15;reasons.push("الـcreative يحتاج تحسين");}
  if(l.paidAdsSignal){score+=10;reasons.push("إشارة إعلانية");}
  if(l.weakFunnel){score+=10;reasons.push("الفunnel يحتاج تحسين");}
  if(l.ecommerceActivity){score+=15;reasons.push("نشاط E-commerce");}
  if(l.publicAudience){score+=10;reasons.push("جمهور عام");}
  if(l.contactable){score+=5;}
  const cat=String(l.category||"").toLowerCase();
  let service=!l.website?"website":(l.ecommerceActivity||cat==="ecommerce"?"ecommerce":l.weakCreative?"video":l.weakFunnel?"landing_page":l.paidAdsSignal?"meta_ads":"website");
  const labels={website:"موقع احترافي",landing_page:"Landing Page",video:"Reels / UGC",meta_ads:"Meta Ads",ecommerce:"تحسين مبيعات E-commerce"};
  return {recommendedService:service,recommendedServiceLabel:labels[service],score:Math.min(100,score),painPoints:reasons,observation:reasons[0]||"يحتاج تدقيق يدوي",message:""};
}
async function analyze(l){
  if(!process.env.OPENAI_API_KEY)return heuristic(l);
  const prompt="حلل هذا النشاط التجاري الجزائري من البيانات المعطاة فقط. لا تخترع معلومات. أرجع JSON فقط بالمفاتيح: recommendedService (website|landing_page|video|meta_ads|ecommerce), score من 0 إلى 100, painPoints array, observation, message, language (darija|french). الرسالة أقل من 80 كلمة ومخصصة للنشاط ولا تعد بنتائج مضمونة. DATA="+JSON.stringify(l);
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input:prompt})});
  if(!r.ok)throw Error("OpenAI HTTP "+r.status);
  const x=await r.json(); const t=x.output_text||"";
  try{return JSON.parse(t.replace(/^```json|```$/g,"").trim())}catch{return heuristic(l);}
}
async function places(){
  if(!process.env.GOOGLE_MAPS_API_KEY)throw Error("GOOGLE_MAPS_API_KEY غير موجود");
  const out=[];
  for(const city of CITIES)for(const category of CATEGORIES){
    const r=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"content-type":"application/json","X-Goog-Api-Key":process.env.GOOGLE_MAPS_API_KEY,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.types,places.rating,places.userRatingCount"},body:JSON.stringify({textQuery:category+" in "+city+", Algeria",pageSize:10,languageCode:"ar"})});
    if(!r.ok)continue; const x=await r.json();
    for(const p of x.places||[])out.push({sourceId:p.id,source:"google_places",businessName:p.displayName?.text||"",city,category,address:p.formattedAddress||"",website:p.websiteUri||"",phone:p.nationalPhoneNumber||"",rating:p.rating,userRatingCount:p.userRatingCount,contactable:!!p.websiteUri||!!p.nationalPhoneNumber,ecommercePotential:["clothing","cosmetics","electronics","ecommerce"].includes(category)});
  }
  return out;
}
function html(){
return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DZ Sales Agent</title><style>
body{margin:0;background:#0b1220;color:#eef4ff;font-family:Arial,sans-serif}.wrap{max-width:1400px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:15px;align-items:center}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}.card,.panel{background:#111d31;border:1px solid #2a3c58;border-radius:14px;padding:16px}.card b{font-size:28px}.btn{background:#1b2b45;color:white;border:1px solid #405473;padding:10px 14px;border-radius:9px;cursor:pointer;margin:3px}.primary{background:#00a77d;border-color:#00a77d}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:11px;border-bottom:1px solid #263650;text-align:right}.muted{color:#91a5c5}.tag{background:#20324f;border-radius:20px;padding:5px 9px}.modal{position:fixed;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;padding:20px}.modal>div{background:#111d31;border-radius:14px;padding:22px;max-width:800px;width:100%;max-height:90vh;overflow:auto}.hidden{display:none}.msg{white-space:pre-wrap;background:#08101d;padding:14px;border-radius:9px}</style></head><body><div class="wrap"><div class="top"><div><h1>🎯 DZ Sales Agent</h1><div class="muted">Lead discovery • AI audit • qualification • personalized outreach</div></div><div><button class="btn primary" onclick="discover()">🔎 اكتشاف Sétif + El Eulma</button><button class="btn" onclick="demo()">🧪 Demo</button></div></div><div id="app"></div></div><div id="modal" class="modal hidden"></div><script>
let D={};
const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(p,o={}){const r=await fetch(p,{...o,headers:{"content-type":"application/json"}});const x=await r.json();if(!r.ok)throw Error(x.error||"Error");return x}
async function load(){D=await api("/api/leads");render()}
function render(){const a=D.leads||[];const c={};a.forEach(x=>c[x.status]=(c[x.status]||0)+1);document.getElementById("app").innerHTML="<div class='cards'><div class='card'>كل الـLeads<br><b>"+a.length+"</b></div><div class='card'>رسائل جاهزة<br><b>"+(c.MESSAGE_READY||0)+"</b></div><div class='card'>معتمدة<br><b>"+(c.APPROVED||0)+"</b></div><div class='card'>مهتمون<br><b>"+(c.INTERESTED||0)+"</b></div></div><div class='panel'><div style='overflow:auto'><table class='table'><thead><tr><th>Business</th><th>City</th><th>Service</th><th>Score</th><th>Status</th><th></th></tr></thead><tbody>"+a.map(l=>"<tr><td><b>"+esc(l.businessName)+"</b><br><span class='muted'>"+esc(l.category)+"</span></td><td>"+esc(l.city)+"</td><td><span class='tag'>"+esc(l.recommendedServiceLabel||"-")+"</span></td><td>"+(l.score||0)+"/100</td><td>"+esc(l.status)+"</td><td><button class='btn' onclick='openLead(\""+l.id+"\")'>فتح</button></td></tr>").join("")+"</tbody></table></div></div>"}
async function discover(){document.getElementById("app").innerHTML="<div class='panel'><h2>🔎 جاري البحث...</h2><p>نبحث في Sétif و El Eulma ونحلل النتائج.</p></div>";try{const x=await api("/api/discover",{method:"POST"});await load();alert("تم اكتشاف "+x.added+" Lead جديد")}catch(e){document.getElementById("app").innerHTML="<div class='panel'><h2>❌ اكتشاف Leads لم يعمل</h2><p>"+esc(e.message)+"</p></div>"}}
async function demo(){try{const x=await api("/api/demo",{method:"POST"});await load();alert("تمت إضافة "+x.added+" Demo")}catch(e){document.getElementById("app").innerHTML="<div class='panel'><h2>❌ Demo Error</h2><p>"+esc(e.message)+"</p></div>"}}
function closeM(){document.getElementById("modal").classList.add("hidden")}
async function openLead(id){const l=D.leads.find(x=>x.id===id);document.getElementById("modal").classList.remove("hidden");document.getElementById("modal").innerHTML="<div><h2>"+esc(l.businessName)+"</h2><p><b>الخدمة:</b> "+esc(l.recommendedServiceLabel||"-")+" &nbsp; <b>Score:</b> "+(l.score||0)+"/100</p><p><b>الملاحظة:</b> "+esc(l.observation||"")+"</p><p><b>نقاط الألم:</b> "+esc((l.painPoints||[]).join(" • "))+"</p><p><b>Website:</b> "+esc(l.website||"لا يوجد")+"</p><p><b>Phone:</b> "+esc(l.phone||"")+"</p><h3>الرسالة</h3><div class='msg'>"+esc(l.message||"لا توجد رسالة بعد")+"</div><br><button class='btn primary' onclick='approve(\""+l.id+"\")'>✅ اعتماد الرسالة</button><button class='btn' onclick='reanalyze(\""+l.id+"\")'>🤖 إعادة التحليل</button><button class='btn' onclick='closeM()'>إغلاق</button></div>"}
async function approve(id){await api("/api/leads/"+id+"/approve",{method:"POST"});closeM();load()}
async function reanalyze(id){await api("/api/leads/"+id+"/analyze",{method:"POST"});closeM();load()}
load();
</script></body></html>`}
async function runAnalyze(d,l){const x=await analyze(l);Object.assign(l,x,{id:l.id,status:"MESSAGE_READY",analyzedAt:new Date().toISOString()});d.audits.unshift({id:ID(),leadId:l.id,action:"AI_ANALYZE",at:new Date().toISOString()})}
async function route(req,res){
 const u=new URL(req.url,"http://localhost"),p=u.pathname,d=await load();
 if(req.method==="GET"&&p==="/")return send(res,200,html(),"text/html");
 if(req.method==="GET"&&p==="/api/health")return send(res,200,{ok:true,agent:"DZ Sales Agent",ai:!!process.env.OPENAI_API_KEY,googlePlaces:!!process.env.GOOGLE_MAPS_API_KEY});
 if(req.method==="GET"&&p==="/api/leads")return send(res,200,d);
 if(req.method==="POST"&&p==="/api/demo"){let n=0;for(const s of [{businessName:"Demo Fashion Sétif",city:"Sétif",category:"clothing",website:"",socialActive:true,ecommercePotential:true,weakCreative:true,contactable:true,phone:"0550000000"},{businessName:"Demo Café El Eulma",city:"El Eulma",category:"cafe",website:"https://example.com",websiteWeak:true,weakCreative:true,contactable:true,phone:"0560000000"}]){if(d.leads.some(x=>x.businessName===s.businessName))continue;const l={...s,id:ID(),status:"NEW",createdAt:new Date().toISOString()};await runAnalyze(d,l);d.leads.unshift(l);n++}await save(d);return send(res,201,{added:n})}
 if(req.method==="POST"&&p==="/api/discover"){const ps=await places();let n=0;for(const z of ps){if(!z.businessName||d.leads.some(x=>x.sourceId===z.sourceId))continue;const l={...z,id:ID(),status:"NEW",createdAt:new Date().toISOString()};await runAnalyze(d,l);d.leads.unshift(l);n++}await save(d);return send(res,201,{added:n,total:ps.length})}
 const m=p.match(/^\/api\/leads\/([^/]+)(?:\/(approve|analyze))?$/);
 if(m){const l=d.leads.find(x=>x.id===m[1]);if(!l)return send(res,404,{error:"Lead not found"});if(req.method==="POST"&&m[2]==="analyze"){await runAnalyze(d,l);await save(d);return send(res,200,l)}if(req.method==="POST"&&m[2]==="approve"){l.status="APPROVED";l.approvedAt=new Date().toISOString();d.outreach.unshift({id:ID(),leadId:l.id,message:l.message,status:"APPROVED",at:new Date().toISOString()});await save(d);return send(res,200,l)}if(req.method==="PATCH"){Object.assign(l,await reqBody(req));await save(d);return send(res,200,l)}}
 if(req.method==="POST"&&p==="/api/leads"){const x=await reqBody(req);if(!x.businessName)return send(res,400,{error:"businessName مطلوب"});const l={...x,id:ID(),status:"NEW",createdAt:new Date().toISOString()};await runAnalyze(d,l);d.leads.unshift(l);await save(d);return send(res,201,l)}
 if(req.method==="GET"&&p==="/api/export.csv"){const rows=d.leads||[],keys=["businessName","category","city","phone","website","score","recommendedServiceLabel","status","message"];const q=v=>"\""+String(v??"").replace(/\"/g,'\"\"')+"\"";const csv=[keys.join(","),...rows.map(x=>keys.map(k=>q(x[k])).join(","))].join("\n");res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=dz-sales-leads.csv"});return res.end("\ufeff"+csv)}
 if(req.method==="POST"&&p==="/api/followups/run"){let n=0;for(const l of d.leads||[]){if(["APPROVED","CONTACTED"].includes(l.status)&&(!l.nextFollowupAt||new Date(l.nextFollowupAt)<=new Date())){l.status="FOLLOW_UP";l.nextFollowupAt=new Date(Date.now()+2*86400000).toISOString();l.followupMessage="سلام، نرجعلك بخصوص الـmini-audit اللي اقترحتو. إذا حاب نبعثلك الملاحظات، نرسلهم هنا.";d.outreach.unshift({id:ID(),leadId:l.id,message:l.followupMessage,status:"FOLLOW_UP_READY",at:new Date().toISOString()});n++}}await save(d);return send(res,200,{updated:n})}
 return send(res,404,{error:"Not found"});
}
http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);send(res,500,{error:e.message})})).listen(PORT,"0.0.0.0",()=>console.log("DZ Sales Agent listening on "+PORT));