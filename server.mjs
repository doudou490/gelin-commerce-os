import http from "node:http";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 10000);
const DATA_FILE = "./sales-agent-data.json";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const CITIES = ["Sétif", "El Eulma"];
const CATEGORIES = [
  ["clothing","محلات ملابس"],
  ["restaurant","مطاعم"],
  ["cafe","مقاهي"],
  ["cosmetics","مستحضرات تجميل"],
  ["gym","قاعات رياضية"],
  ["real_estate","وكالات عقارية"],
  ["electronics","محلات إلكترونيات"],
  ["furniture","أثاث"],
  ["ecommerce","متاجر إلكترونية"]
];
const SERVICES = {
  website:"موقع احترافي",
  landing_page:"Landing Page / Product Page",
  ecommerce:"متجر E-commerce",
  video:"Video Editing / UGC / Reels",
  meta_ads:"Meta Ads",
  cro:"تحسين التحويلات"
};
const STATUSES = ["NEW","RESEARCHED","QUALIFIED","MESSAGE_READY","APPROVED","CONTACTED","FOLLOW_UP_1","FOLLOW_UP_2","FOLLOW_UP_FINAL","REPLIED","INTERESTED","PRICE_REQUESTED","MEETING","CLIENT","NOT_INTERESTED","OPTED_OUT"];

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function load() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE,"utf8"));
  } catch {
    const d = { leads:[], outreach:[], followups:[], events:[], settings:{cities:CITIES,categories:CATEGORIES.map(x=>x[0])} };
    await save(d);
    return d;
  }
}
async function save(d) {
  await fs.writeFile(DATA_FILE, JSON.stringify(d,null,2));
}
async function body(req) {
  let s = "";
  for await (const c of req) s += c;
  if (!s) return {};
  return JSON.parse(s);
}
function send(res,status,data,type="application/json") {
  res.writeHead(status,{
    "content-type":type+"; charset=utf-8",
    "cache-control":"no-store",
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":"content-type"
  });
  res.end(type==="text/html" || type==="text/csv" ? data : JSON.stringify(data));
}
function esc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function unique(a){return [...new Set(a.filter(Boolean))];}

async function fetchJson(url, options={}, timeoutMs=12000) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(),timeoutMs);
  try {
    const r = await fetch(url,{...options,signal:ac.signal});
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error("HTTP "+r.status);
    return data;
  } finally { clearTimeout(t); }
}

async function websiteAudit(url) {
  if (!url) return {exists:false,reachable:false,notes:["لا يوجد موقع مسجل"]};
  try {
    const u = /^https?:\/\//i.test(url) ? url : "https://"+url;
    const r = await fetch(u,{redirect:"follow",signal:AbortSignal.timeout(8000),headers:{"user-agent":"DZ-Sales-Agent/2.0"}});
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.trim()||"";
    const viewport = /name=["']viewport["']/i.test(html);
    const og = /property=["']og:image["']/i.test(html);
    const wa = /wa\.me|whatsapp/i.test(html);
    const forms = /<form\b/i.test(html);
    const notes = [];
    if(!viewport) notes.push("لا توجد إشارة واضحة إلى mobile viewport");
    if(!og) notes.push("لا توجد صورة OG واضحة");
    if(!forms && !wa) notes.push("CTA/طلب مباشر غير واضح");
    return {exists:true,reachable:r.ok,status:r.status,title:title.slice(0,140),mobile:viewport,ogImage:og,whatsapp:wa,form:forms,notes};
  } catch(e) {
    return {exists:true,reachable:false,notes:["الموقع غير قابل للوصول من الخادم حاليا: "+e.message]};
  }
}

function heuristic(l, audit={}) {
  let score=0, reasons=[];
  if(!l.website){score+=20; reasons.push("لا يوجد موقع واضح");}
  if(l.website && (!audit.reachable || audit.status>=400)){score+=10; reasons.push("الموقع غير متاح/يحتاج فحص");}
  if(l.website && audit.reachable && !audit.mobile){score+=10; reasons.push("تجربة الهاتف تحتاج تحسين");}
  if(l.socialActive){score+=10; reasons.push("حضور على السوشيال");}
  if(["clothing","cosmetics","electronics","ecommerce"].includes(l.category)){score+=15; reasons.push("المنتج مناسب للبيع أونلاين");}
  if(l.weakCreative){score+=15; reasons.push("الـcreative يحتاج تحسين");}
  if(l.weakFunnel || (audit.reachable && !audit.form && !audit.whatsapp)){score+=10; reasons.push("مسار التحويل/الطلب غير واضح");}
  if(l.ecommerceActivity){score+=15; reasons.push("نشاط تجارة إلكترونية");}
  if(l.publicAudience){score+=10; reasons.push("جمهور عام قابل للاستهداف");}
  if(l.contactable){score+=5; reasons.push("قناة تواصل متاحة");}
  score=Math.min(100,score);

  let service="website";
  if(!l.website) service="website";
  else if(l.ecommerceActivity || l.category==="ecommerce") service="ecommerce";
  else if(l.weakCreative) service="video";
  else if(l.weakFunnel || (audit.reachable && !audit.form && !audit.whatsapp)) service="landing_page";
  else if(l.paidAdsSignal) service="meta_ads";
  else if(audit.reachable && !audit.mobile) service="cro";

  const observation = reasons[0] || "يحتاج مراجعة يدوية";
  const msg = l.preferredLanguage==="french"
    ? "Bonjour, j’ai regardé rapidement votre présence en ligne. J’ai remarqué un point simple qui pourrait faciliter le parcours client. Si vous voulez, je peux vous envoyer gratuitement 2-3 remarques concrètes."
    : "سلام 👋 شفت الحضور الرقمي تاعكم بسرعة، ولاحظت نقطة بسيطة تقدر تحسن طريقة وصول الزبون للطلب. إذا حاب، نقدر نبعثلك 2-3 ملاحظات مجانية ومحددة.";
  return {score,recommendedService:service,recommendedServiceLabel:SERVICES[service],painPoints:unique(reasons),observation,message:msg,language:l.preferredLanguage||"darija"};
}

async function analyze(l) {
  const audit = await websiteAudit(l.website);
  let result = heuristic(l,audit);
  if(process.env.OPENAI_API_KEY) {
    try {
      const prompt = `Analyze this Algerian business using ONLY supplied facts. Never invent followers, ads, sales, revenue, reviews or results. Return JSON only with: recommendedService (website|landing_page|ecommerce|video|meta_ads|cro), score 0-100, painPoints array, observation, message, language. Message under 80 words in Algerian Darija or French and mention only verified observations. BUSINESS=${JSON.stringify({...l,audit})}`;
      const x = await fetchJson("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"content-type":"application/json","authorization:"Bearer "+process.env.OPENAI_API_KEY},
        body:JSON.stringify({model:MODEL,input:prompt})
      },20000);
      const text=x.output_text||"";
      const parsed=JSON.parse(text.replace(/^\`\`\`json|\`\`\`$/g,"").trim());
      if(parsed && SERVICES[parsed.recommendedService]) result={...result,...parsed,recommendedServiceLabel:SERVICES[parsed.recommendedService],score:Math.max(0,Math.min(100,Number(parsed.score)||result.score))};
    } catch(e) {
      result.aiError=e.message;
    }
  }
  return { ...result, audit };
}

async function discoverFree() {
  const results=[];
  const seen=new Set();
  for(const city of CITIES) {
    for(const [key,label] of CATEGORIES) {
      const q=encodeURIComponent(label+" "+city+" Algeria");
      try {
        const data=await fetchJson("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&extratags=1&q="+q,{
          headers:{"user-agent":"DZ-Sales-Agent/2.0 (lead research)"}
        },10000);
        for(const p of data||[]) {
          const name=(p.name||p.display_name?.split(",")[0]||"").trim();
          const sourceId=p.osm_type+":"+p.osm_id;
          if(!name || seen.has(sourceId)) continue;
          seen.add(sourceId);
          const tags=p.extratags||{};
          const website=tags.website||tags["contact:website"]||"";
          const phone=tags.phone||tags["contact:phone"]||"";
          const facebook=tags.facebook||"";
          const instagram=tags.instagram||"";
          results.push({
            sourceId,source:"openstreetmap",businessName:name,category:key,categoryLabel:label,city,
            address:p.display_name||"",website,phone,facebook,instagram,
            contactable:!!(website||phone||facebook||instagram),
            socialActive:!!(facebook||instagram),
            ecommercePotential:["clothing","cosmetics","electronics","ecommerce"].includes(key),
            publicAudience:false
          });
        }
      } catch(e) {}
    }
  }
  return results;
}

function demoLeads() {
  return [
    {businessName:"Lina Fashion Sétif",category:"clothing",city:"Sétif",website:"",phone:"0555001001",instagram:"https://instagram.com/example",socialActive:true,ecommercePotential:true,weakCreative:true,contactable:true},
    {businessName:"Maison Cosmétiques El Eulma",category:"cosmetics",city:"El Eulma",website:"https://example.com",phone:"0555001002",socialActive:true,ecommercePotential:true,weakCreative:true,weakFunnel:true,contactable:true},
    {businessName:"FitZone Sétif",category:"gym",city:"Sétif",website:"",phone:"0555001003",socialActive:true,weakCreative:true,contactable:true},
    {businessName:"Tech House El Eulma",category:"electronics",city:"El Eulma",website:"",phone:"0555001004",socialActive:true,ecommercePotential:true,ecommerceActivity:true,contactable:true},
    {businessName:"Immo Sétif Centre",category:"real_estate",city:"Sétif",website:"https://example.com",phone:"0555001005",websiteWeak:true,weakFunnel:true,contactable:true}
  ];
}

async function addLead(d,raw,isDemo=false) {
  const duplicate=d.leads.find(x=>
    (raw.sourceId && x.sourceId===raw.sourceId) ||
    (raw.phone && x.phone===raw.phone) ||
    (raw.website && x.website===raw.website) ||
    (x.businessName?.toLowerCase()===raw.businessName?.toLowerCase() && x.city===raw.city)
  );
  if(duplicate) return {lead:duplicate,added:false};
  const l={...raw,id:id(),status:"NEW",demo:isDemo,createdAt:now(),updatedAt:now()};
  const a=await analyze(l);
  Object.assign(l,a,{status:"MESSAGE_READY",analyzedAt:now()});
  d.leads.unshift(l);
  d.events.unshift({id:id(),type:"lead.analyzed",leadId:l.id,at:now()});
  return {lead:l,added:true};
}

function stats(d) {
  const counts={};
  for(const l of d.leads) counts[l.status]=(counts[l.status]||0)+1;
  return {total:d.leads.length,counts,highPotential:d.leads.filter(x=>(x.score||0)>=70).length,followupsDue:d.leads.filter(x=>x.nextFollowupAt&&new Date(x.nextFollowupAt)<=new Date()&&!["CLIENT","NOT_INTERESTED","OPTED_OUT"].includes(x.status)).length};
}

async function route(req,res) {
  const u=new URL(req.url,"http://localhost"), p=u.pathname;
  if(req.method==="OPTIONS") return send(res,204,{});
  const d=await load();

  if(req.method==="GET"&&p==="/") return send(res,200,HTML,"text/html");
  if(req.method==="GET"&&p==="/api/health") return send(res,200,{
    ok:true,agent:"DZ Sales Agent 2.0",version:"2.0.0",
    storage:"local-json (Render free filesystem; resets on restart)",
    ai:{connected:!!process.env.OPENAI_API_KEY,model:MODEL},
    googlePlaces:{connected:!!process.env.GOOGLE_MAPS_API_KEY},
    freeDiscovery:true,
    leads:d.leads.length
  });
  if(req.method==="GET"&&p==="/api/stats") return send(res,200,stats(d));
  if(req.method==="GET"&&p==="/api/leads") {
    const q=(u.searchParams.get("q")||"").toLowerCase();
    const status=u.searchParams.get("status")||"";
    const city=u.searchParams.get("city")||"";
    const category=u.searchParams.get("category")||"";
    let leads=d.leads.filter(l=>(!q||JSON.stringify(l).toLowerCase().includes(q))&&(!status||l.status===status)&&(!city||l.city===city)&&(!category||l.category===category));
    return send(res,200,{leads,stats:stats(d),cities:CITIES,categories:CATEGORIES});
  }
  if(req.method==="POST"&&p==="/api/demo") {
    let added=0;
    for(const x of demoLeads()){const r=await addLead(d,x,true);if(r.added)added++;}
    await save(d); return send(res,201,{ok:true,added,total:d.leads.length});
  }
  if(req.method==="POST"&&p==="/api/discover") {
    const found=await discoverFree(); let added=0;
    for(const x of found){const r=await addLead(d,x,false);if(r.added)added++;}
    await save(d); return send(res,201,{ok:true,source:"OpenStreetMap/Nominatim",found:found.length,added,total:d.leads.length});
  }
  if(req.method==="POST"&&p==="/api/leads") {
    const x=await body(req);
    if(!x.businessName) return send(res,400,{error:"businessName مطلوب"});
    const r=await addLead(d,x,false); await save(d);
    return send(res,r.added?201:200,{ok:true,...r});
  }
  const m=p.match(/^\/api\/leads\/([^/]+)(?:\/(analyze|approve|status))?$/);
  if(m) {
    const l=d.leads.find(x=>x.id===m[1]);
    if(!l) return send(res,404,{error:"Lead not found"});
    if(req.method==="DELETE"){d.leads=d.leads.filter(x=>x.id!==l.id);await save(d);return send(res,200,{ok:true});}
    if(req.method==="PATCH"){Object.assign(l,await body(req),{updatedAt:now()});await save(d);return send(res,200,l);}
    if(req.method==="POST"&&m[2]==="analyze"){Object.assign(l,await analyze(l),{status:"MESSAGE_READY",analyzedAt:now(),updatedAt:now()});await save(d);return send(res,200,l);}
    if(req.method==="POST"&&m[2]==="approve"){l.status="APPROVED";l.approvedAt=now();l.updatedAt=now();d.outreach.unshift({id:id(),leadId:l.id,message:l.message,status:"APPROVED",at:now()});d.events.unshift({id:id(),type:"message.approved",leadId:l.id,at:now()});await save(d);return send(res,200,l);}
    if(req.method==="POST"&&m[2]==="status"){const x=await body(req);if(!STATUSES.includes(x.status))return send(res,400,{error:"Invalid status"});l.status=x.status;l.updatedAt=now();if(x.status==="CONTACTED")l.lastContactedAt=now();if(["APPROVED","CONTACTED","FOLLOW_UP_1","FOLLOW_UP_2"].includes(x.status))l.nextFollowupAt=new Date(Date.now()+2*86400000).toISOString();await save(d);return send(res,200,l);}
  }
  if(req.method==="POST"&&p==="/api/followups/run"){
    let created=0;
    for(const l of d.leads){
      if(!l.nextFollowupAt || new Date(l.nextFollowupAt)>new Date()) continue;
      if(["CLIENT","NOT_INTERESTED","OPTED_OUT","REPLIED","INTERESTED"].includes(l.status)) continue;
      const step=l.status==="APPROVED"?"FOLLOW_UP_1":l.status==="FOLLOW_UP_1"?"FOLLOW_UP_2":"FOLLOW_UP_FINAL";
      l.status=step;l.nextFollowupAt=new Date(Date.now()+3*86400000).toISOString();l.followupMessage=step==="FOLLOW_UP_1"?"سلام 👋 نرجعلك بخصوص الرسالة السابقة. إذا حاب نبعثلك الملاحظات اللي لاحظتها على الحضور الرقمي تاعكم، نرسلهم هنا.":step==="FOLLOW_UP_2"?"سلام، عندي 2 ملاحظات صغار على طريقة استقبال الزبون عندكم. إذا حاب نبعثهم لك بلا التزام.":"آخر متابعة مني باش ما نزعجكش. إذا احتجت أي مساعدة في الموقع أو الإعلانات، راني موجود.";
      d.outreach.unshift({id:id(),leadId:l.id,message:l.followupMessage,status:"FOLLOW_UP_READY",at:now()});created++;
    }
    await save(d);return send(res,200,{ok:true,created});
  }
  if(req.method==="GET"&&p==="/api/export.csv"){
    const keys=["businessName","category","city","address","phone","website","facebook","instagram","score","recommendedServiceLabel","observation","status","message","nextFollowupAt"];
    const q=v=>"""+String(v??"").replace(/"/g,'""')+""";
    const csv=[keys.join(","),...d.leads.map(l=>keys.map(k=>q(l[k])).join(","))].join("\n");
    res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=dz-sales-leads.csv"});
    return res.end("\ufeff"+csv);
  }
  return send(res,404,{error:"Not found",path:p});
}

const HTML = await fs.readFile("./public/index.html","utf8");
http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);send(res,500,{error:e.message||"Server error"});})).listen(PORT,"0.0.0.0",()=>console.log("DZ Sales Agent 2.0 listening on "+PORT));
