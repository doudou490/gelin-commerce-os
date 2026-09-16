const express=require('express');
const crypto=require('crypto');
const path=require('path');
const app=express();
const PORT=process.env.PORT||10000;
const PUBLIC_URL=(process.env.PUBLIC_URL||'https://gelin-commerce-os.onrender.com').replace(/\/$/,'');
app.use(express.json());
app.use(express.static('public'));
function setup(res,provider){res.status(503).send(`<!doctype html><meta charset="utf-8"><title>GELIN Commerce OS</title><style>body{font-family:Arial;display:grid;place-items:center;min-height:100vh;background:#f6f8fb}.box{background:#fff;padding:30px;border-radius:18px;max-width:560px;border:1px solid #e4e7ec}h1{margin-top:0}</style><div class="box"><h1>إعداد تسجيل الدخول</h1><p>تسجيل الدخول باستخدام ${provider} يحتاج إعداد OAuth في خادم GELIN. لم يتم طلب كلمة المرور أو حفظها هنا.</p><p>بعد إضافة مفاتيح OAuth إلى Render سيعمل اختيار الحساب الرسمي مباشرة.</p><button onclick="history.back()">العودة</button></div>`)}
app.get('/auth/google',(req,res)=>{const id=process.env.GOOGLE_CLIENT_ID;if(!id)return setup(res,'Google');const state=crypto.randomBytes(24).toString('hex');const redirect=`${PUBLIC_URL}/auth/google/callback`;const params=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',scope:'openid email profile',access_type:'online',prompt:'select_account',state});res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+params.toString())});
app.get('/auth/facebook',(req,res)=>{const id=process.env.FACEBOOK_APP_ID;if(!id)return setup(res,'Facebook');const state=crypto.randomBytes(24).toString('hex');const redirect=`${PUBLIC_URL}/auth/facebook/callback`;const params=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',scope:'email,public_profile',state});res.redirect('https://www.facebook.com/v24.0/dialog/oauth?'+params.toString())});
app.get('/auth/google/callback',(req,res)=>res.status(501).send('Google OAuth callback needs the persistent user/session backend to be enabled before accounts are created.'));
app.get('/auth/facebook/callback',(req,res)=>res.status(501).send('Facebook OAuth callback needs the persistent user/session backend to be enabled before accounts are created.'));
app.get('/health',(req,res)=>res.json({ok:true,service:'gelin-commerce-os'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`GELIN Commerce OS listening on ${PORT}`));
