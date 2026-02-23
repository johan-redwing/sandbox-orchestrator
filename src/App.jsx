import { useState, useEffect, useCallback } from "react";
import {
  Shield, Server, Cpu, MemoryStick, HardDrive, Activity, Wifi, Clock,
  Terminal, Download, Copy, Check, ChevronRight, ChevronLeft,
  Lock, Unlock, Eye, EyeOff, LogOut, Users, LayoutDashboard, Box,
  Plus, Trash2, Edit, AlertTriangle, AlertCircle, CheckCircle,
  Play, Square, DollarSign, TrendingUp,
  Zap, Database, Brain, Globe, Key, BarChart3,
  ShieldCheck, ShieldAlert, ScrollText, CreditCard, Wallet,
  ArrowUpRight, ArrowDownRight, X, Save, Layers, CloudCog, RefreshCw, Settings
} from "lucide-react";

// ═══════════════════════════════════════
//  THEMES
// ═══════════════════════════════════════
const ADMIN_THEME = {
  bg:"#0a0e17",bgCard:"#111827",bgCardHover:"#1a2332",bgSidebar:"#0d1321",bgInput:"#1a2332",bgModal:"#111827",
  border:"#1e293b",borderFocus:"#00d4aa",borderSubtle:"#162032",
  text:"#e2e8f0",textMuted:"#64748b",textDim:"#475569",
  primary:"#00d4aa",primaryDim:"rgba(0,212,170,0.15)",secondary:"#6c8cff",secondaryDim:"rgba(108,140,255,0.15)",
  accent:"#ff6c9d",accentDim:"rgba(255,108,157,0.15)",warning:"#f0c040",warningDim:"rgba(240,192,64,0.15)",
  danger:"#ff4466",dangerDim:"rgba(255,68,102,0.15)",success:"#00d4aa",successDim:"rgba(0,212,170,0.15)",
  font:"'JetBrains Mono',monospace",fontBody:"'IBM Plex Sans',sans-serif"
};
const CUSTOMER_THEME = {
  bg:"#f8fafc",bgCard:"#ffffff",bgCardHover:"#f1f5f9",bgSidebar:"#ffffff",bgInput:"#f1f5f9",bgModal:"#ffffff",
  border:"#e2e8f0",borderFocus:"#3b82f6",borderSubtle:"#f1f5f9",
  text:"#1e293b",textMuted:"#64748b",textDim:"#94a3b8",
  primary:"#3b82f6",primaryDim:"rgba(59,130,246,0.1)",secondary:"#8b5cf6",secondaryDim:"rgba(139,92,246,0.1)",
  accent:"#f43f5e",accentDim:"rgba(244,63,94,0.1)",warning:"#f59e0b",warningDim:"rgba(245,158,11,0.1)",
  danger:"#ef4444",dangerDim:"rgba(239,68,68,0.1)",success:"#10b981",successDim:"rgba(16,185,129,0.1)",
  font:"'DM Sans',sans-serif",fontBody:"'DM Sans',sans-serif"
};

// ═══════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════
function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`/api${path}`, { ...opts, headers }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

// ═══════════════════════════════════════
//  INSTANCE CATALOG (for display)
// ═══════════════════════════════════════
const INSTANCES = [
  {id:"m8i.large",family:"M8i",vcpu:2,mem:8,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.1008},
  {id:"m8i.xlarge",family:"M8i",vcpu:4,mem:16,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.2016},
  {id:"m8i.2xlarge",family:"M8i",vcpu:8,mem:32,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.4032},
  {id:"m8i.4xlarge",family:"M8i",vcpu:16,mem:64,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.8064},
  {id:"c8i.large",family:"C8i",vcpu:2,mem:4,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.0892},
  {id:"c8i.xlarge",family:"C8i",vcpu:4,mem:8,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.1785},
  {id:"c8i.2xlarge",family:"C8i",vcpu:8,mem:16,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.357},
  {id:"r8i.large",family:"R8i",vcpu:2,mem:16,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.1323},
  {id:"r8i.xlarge",family:"R8i",vcpu:4,mem:32,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.2646},
  {id:"r8i.2xlarge",family:"R8i",vcpu:8,mem:64,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.5292},
  {id:"m8i-flex.large",family:"M8i-flex",vcpu:2,mem:8,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.09408},
  {id:"m8i-flex.xlarge",family:"M8i-flex",vcpu:4,mem:16,net:"12.5 Gbps",proc:"Intel Xeon 5th Gen",priceHr:0.18816},
];
const ICON_MAP = {Terminal,Database,Brain,Globe,Server,Cpu,Layers,CloudCog};
const fmtCurrency = n => '$' + (n||0).toFixed(2);
const fmtTime = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const relTime = iso => { const d=(Date.now()-new Date(iso).getTime())/1000; if(d<60)return'just now'; if(d<3600)return`${Math.floor(d/60)}m ago`; if(d<86400)return`${Math.floor(d/3600)}h ago`; return`${Math.floor(d/86400)}d ago`; };

// ═══════════════════════════════════════
//  SHARED UI COMPONENTS
// ═══════════════════════════════════════
function Sparkline({data,width=120,height=32,color="#00d4aa"}) {
  if(!data||data.length<2)return null;
  const max=Math.max(...data,1),min=Math.min(...data,0),range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-min)/range)*height}`).join(' ');
  return <svg width={width} height={height} style={{display:'block'}}><polygon points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity={0.15}/><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"/></svg>;
}
function StatusBadge({status,T}){const m={running:{bg:T.successDim,c:T.success,l:"Running"},stopped:{bg:T.warningDim,c:T.warning,l:"Stopped"},terminated:{bg:T.dangerDim,c:T.danger,l:"Terminated"},deploying:{bg:T.secondaryDim,c:T.secondary,l:"Deploying"},failed:{bg:T.dangerDim,c:T.danger,l:"Failed"},active:{bg:T.successDim,c:T.success,l:"Active"},suspended:{bg:T.dangerDim,c:T.danger,l:"Suspended"}};const s=m[status]||m.running;return<span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:20,background:s.bg,color:s.c,fontSize:12,fontWeight:600}}><span style={{width:6,height:6,borderRadius:'50%',background:s.c,boxShadow:status==='running'?`0 0 6px ${s.c}`:'none'}}/>{s.l}</span>;}
function ScoreRing({score,size=80,T}){const r=(size-8)/2,c=2*Math.PI*r,off=c-(score/100)*c,col=score>=90?T.success:score>=75?T.warning:T.danger;return<div style={{position:'relative',width:size,height:size}}><svg width={size} height={size} style={{transform:'rotate(-90deg)'}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth="4"/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="4" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{transition:'stroke-dashoffset 0.8s'}}/></svg><div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:size*0.28,fontWeight:700,color:T.text}}>{score}</span><span style={{fontSize:size*0.12,color:T.textMuted}}>SCORE</span></div></div>;}
function MetricCard({label,value,unit,icon:Icon,sparkData,T,trend}){return<div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16,display:'flex',flexDirection:'column',gap:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:T.textMuted,fontSize:12,fontWeight:500}}>{label}</span>{Icon&&<Icon size={14} color={T.textDim}/>}</div><div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontSize:24,fontWeight:700,color:T.text}}>{value}</span>{unit&&<span style={{fontSize:12,color:T.textMuted}}>{unit}</span>}{trend!==undefined&&<span style={{fontSize:11,color:trend>=0?T.success:T.danger,marginLeft:4,display:'flex',alignItems:'center',gap:2}}>{trend>=0?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}{Math.abs(trend)}%</span>}</div>{sparkData&&<Sparkline data={sparkData} color={T.primary} width={140} height={28}/>}</div>;}
function Modal({open,onClose,title,children,T,wide}){if(!open)return null;return<div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:T.bgModal,border:`1px solid ${T.border}`,borderRadius:14,width:wide?720:520,maxWidth:'92vw',maxHeight:'88vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.4)'}}><div style={{padding:'18px 24px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:16,fontWeight:600,color:T.text}}>{title}</span><button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}><X size={18}/></button></div><div style={{padding:24,overflowY:'auto',flex:1}}>{children}</div></div></div>;}
function Btn({children,onClick,variant="primary",size="md",disabled,style:sx,T}){const base={border:'none',cursor:disabled?'not-allowed':'pointer',fontWeight:600,borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,transition:'all 0.15s',opacity:disabled?0.5:1,fontFamily:'inherit'};const sizes={sm:{padding:'6px 12px',fontSize:12},md:{padding:'9px 18px',fontSize:13},lg:{padding:'12px 24px',fontSize:14}};const vars={primary:{background:T.primary,color:'#fff'},secondary:{background:T.bgInput,color:T.text,border:`1px solid ${T.border}`},danger:{background:T.dangerDim,color:T.danger},ghost:{background:'transparent',color:T.textMuted},success:{background:T.successDim,color:T.success}};return<button onClick={disabled?undefined:onClick} style={{...base,...sizes[size],...vars[variant],...sx}}>{children}</button>;}
function Input({label,value,onChange,placeholder,type="text",T,multiline,rows=3,style:sx}){const s={width:'100%',padding:'9px 12px',background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none',resize:'vertical',boxSizing:'border-box',...sx};return<div style={{display:'flex',flexDirection:'column',gap:5}}>{label&&<label style={{fontSize:12,fontWeight:500,color:T.textMuted}}>{label}</label>}{multiline?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={s}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={s}/>}</div>;}
function Select({label,value,onChange,options,T}){return<div style={{display:'flex',flexDirection:'column',gap:5}}>{label&&<label style={{fontSize:12,fontWeight:500,color:T.textMuted}}>{label}</label>}<select value={value} onChange={e=>onChange(e.target.value)} style={{width:'100%',padding:'9px 12px',background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;}
function ErrorBox({msg,T}){if(!msg)return null;return<div style={{background:T.dangerDim,border:`1px solid ${T.danger}`,borderRadius:8,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}><AlertCircle size={14} color={T.danger}/><span style={{color:T.danger,fontSize:13}}>{msg}</span></div>;}
function Loading({T,text="Loading..."}){return<div style={{padding:60,textAlign:'center',color:T.textMuted}}><RefreshCw size={24} style={{animation:'spin 1s linear infinite',marginBottom:12}}/><div>{text}</div><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;}

// ═══════════════════════════════════════
//  FIRST-RUN SETUP
// ═══════════════════════════════════════
function SetupScreen({onComplete}){
  const[username,setUsername]=useState('admin');const[password,setPassword]=useState('');const[confirm,setConfirm]=useState('');const[displayName,setDisplayName]=useState('Platform Admin');const[showPw,setShowPw]=useState(false);const[error,setError]=useState('');const[loading,setLoading]=useState(false);
  const pwMatch=password===confirm;const pwLong=password.length>=8;const pwNoSpace=!password.includes(' ')&&password.trim()===password;const unLong=username.trim().length>=3;const valid=pwMatch&&pwLong&&pwNoSpace&&unLong&&password!=='';
  const submit=async e=>{e.preventDefault();setError('');if(!valid)return;setLoading(true);try{await api('/setup/admin',{method:'POST',body:JSON.stringify({username:username.trim(),password,displayName:displayName.trim()})});onComplete();}catch(err){setError(err.message);}finally{setLoading(false);}};
  const ruleColor=(ok)=>ok?'#22c55e':'#64748b';
  return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)',fontFamily:"'DM Sans',sans-serif",position:'relative',overflow:'hidden'}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{position:'absolute',inset:0,opacity:0.04,backgroundImage:'linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>
    <form onSubmit={submit} style={{position:'relative',zIndex:1,background:'rgba(15,23,42,0.85)',border:'1px solid rgba(100,116,139,0.3)',borderRadius:16,padding:40,width:440,maxWidth:'90vw',backdropFilter:'blur(20px)',boxShadow:'0 24px 64px rgba(0,0,0,0.3)'}}>
      <div style={{textAlign:'center',marginBottom:28}}><div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:56,height:56,borderRadius:14,background:'rgba(0,212,170,0.15)',marginBottom:16}}><Settings size={28} color="#00d4aa"/></div><h1 style={{color:'#e2e8f0',fontSize:22,fontWeight:700,margin:'0 0 6px'}}>Initial Setup</h1><p style={{color:'#94a3b8',fontSize:13,margin:0}}>Create your admin account to get started</p></div>
      {error&&<ErrorBox msg={error} T={ADMIN_THEME}/>}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Admin Username</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="admin" autoFocus style={{width:'100%',padding:'11px 14px',background:'rgba(30,41,59,0.6)',border:`1px solid ${unLong?'rgba(0,212,170,0.4)':'rgba(100,116,139,0.3)'}`,borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/></div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Display Name</label><input type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Platform Admin" style={{width:'100%',padding:'11px 14px',background:'rgba(30,41,59,0.6)',border:'1px solid rgba(100,116,139,0.3)',borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/></div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Password</label><div style={{position:'relative'}}><input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters" style={{width:'100%',padding:'11px 40px 11px 14px',background:'rgba(30,41,59,0.6)',border:`1px solid ${pwLong&&pwNoSpace?'rgba(0,212,170,0.4)':'rgba(100,116,139,0.3)'}`,borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/><button type="button" onClick={()=>setShowPw(!showPw)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:4}}>{showPw?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Confirm Password</label><input type={showPw?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter password" style={{width:'100%',padding:'11px 14px',background:'rgba(30,41,59,0.6)',border:`1px solid ${confirm&&pwMatch?'rgba(0,212,170,0.4)':confirm&&!pwMatch?'rgba(239,68,68,0.5)':'rgba(100,116,139,0.3)'}`,borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/></div>
      </div>
      <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:4}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>{unLong?<CheckCircle size={12} color={ruleColor(true)}/>:<AlertCircle size={12} color={ruleColor(false)}/>}<span style={{fontSize:11,color:ruleColor(unLong)}}>Username at least 3 characters</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>{pwLong?<CheckCircle size={12} color={ruleColor(true)}/>:<AlertCircle size={12} color={ruleColor(false)}/>}<span style={{fontSize:11,color:ruleColor(pwLong)}}>Password at least 8 characters</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>{pwNoSpace?<CheckCircle size={12} color={ruleColor(true)}/>:<AlertCircle size={12} color={ruleColor(false)}/>}<span style={{fontSize:11,color:ruleColor(pwNoSpace)}}>No spaces in password</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>{confirm&&pwMatch?<CheckCircle size={12} color={ruleColor(true)}/>:<AlertCircle size={12} color={ruleColor(false)}/>}<span style={{fontSize:11,color:ruleColor(confirm&&pwMatch)}}>Passwords match</span></div>
      </div>
      <button type="submit" disabled={loading||!valid} style={{width:'100%',padding:'12px 0',marginTop:20,background:loading?'#059669':valid?'#10b981':'#374151',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:loading?'wait':valid?'pointer':'not-allowed',fontFamily:'inherit',opacity:valid?1:0.5,transition:'all 0.2s'}}>{loading?'Creating Admin...':'Create Admin & Continue'}</button>
      <p style={{textAlign:'center',color:'#94a3b8',fontSize:11,marginTop:20,marginBottom:0,opacity:0.6}}>This account has full platform control. Store your credentials securely.</p>
    </form>
  </div>;
}

// ═══════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════
function LoginScreen({onLogin}){
  const[username,setUsername]=useState('');const[password,setPassword]=useState('');const[showPw,setShowPw]=useState(false);const[error,setError]=useState('');const[loading,setLoading]=useState(false);
  const submit=async e=>{e.preventDefault();setError('');setLoading(true);try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem('token',data.token);onLogin(data.user);}catch(err){setError(err.message);}finally{setLoading(false);}};
  return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)',fontFamily:"'DM Sans',sans-serif",position:'relative',overflow:'hidden'}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{position:'absolute',inset:0,opacity:0.04,backgroundImage:'linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>
    <form onSubmit={submit} style={{position:'relative',zIndex:1,background:'rgba(15,23,42,0.85)',border:'1px solid rgba(100,116,139,0.3)',borderRadius:16,padding:40,width:400,maxWidth:'90vw',backdropFilter:'blur(20px)',boxShadow:'0 24px 64px rgba(0,0,0,0.3)'}}>
      <div style={{textAlign:'center',marginBottom:32}}><div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:56,height:56,borderRadius:14,background:'rgba(59,130,246,0.15)',marginBottom:16}}><Shield size={28} color="#3b82f6"/></div><h1 style={{color:'#e2e8f0',fontSize:22,fontWeight:700,margin:'0 0 6px'}}>Sandbox Console</h1><p style={{color:'#94a3b8',fontSize:13,margin:0}}>Intel-powered secure sandbox platform</p></div>
      {error&&<ErrorBox msg={error} T={ADMIN_THEME}/>}
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',flexDirection:'column',gap:6}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Username</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" autoFocus style={{width:'100%',padding:'11px 14px',background:'rgba(30,41,59,0.6)',border:'1px solid rgba(100,116,139,0.3)',borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/></div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}><label style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>Password</label><div style={{position:'relative'}}><input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" style={{width:'100%',padding:'11px 40px 11px 14px',background:'rgba(30,41,59,0.6)',border:'1px solid rgba(100,116,139,0.3)',borderRadius:8,color:'#e2e8f0',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/><button type="button" onClick={()=>setShowPw(!showPw)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:4}}>{showPw?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></div>
      </div>
      <button type="submit" disabled={loading||!username||!password} style={{width:'100%',padding:'12px 0',marginTop:24,background:loading?'#2563eb':'#3b82f6',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:loading?'wait':'pointer',fontFamily:'inherit',opacity:(!username||!password)?0.5:1}}>{loading?'Authenticating...':'Sign In'}</button>
      <p style={{textAlign:'center',color:'#94a3b8',fontSize:11,marginTop:20,marginBottom:0,opacity:0.6}}>Powered by Intel Xeon 5th Gen Scalable Processors</p>
    </form>
  </div>;
}

// ═══════════════════════════════════════
//  DEPLOY FLOW (customer)
// ═══════════════════════════════════════
function DeployFlow({templates,credits,T,onDeployed}){
  const[step,setStep]=useState('select');const[tmpl,setTmpl]=useState(null);const[instType,setInstType]=useState('');
  const[deploying,setDeploying]=useState(false);const[error,setError]=useState('');
  const[creds,setCreds]=useState(null);const[keyAck,setKeyAck]=useState(false);const[copied,setCopied]=useState('');
  const copyTxt=(txt,id)=>{navigator.clipboard.writeText(txt).catch(()=>{});setCopied(id);setTimeout(()=>setCopied(''),2000);};
  const doDeploy=async()=>{
    setDeploying(true);setError('');
    try{
      const data=await api('/customer/sandboxes',{method:'POST',body:JSON.stringify({templateId:tmpl.id,instanceType:instType||tmpl.recommended})});
      setCreds(data);setStep('credentials');
    }catch(e){setError(e.message);}finally{setDeploying(false);}
  };
  const downloadKey=()=>{if(!creds)return;const blob=new Blob([creds.privateKey],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${creds.sandboxId}-key.pem`;a.click();URL.revokeObjectURL(url);api(`/customer/sandboxes/${creds.sandboxId}/key-downloaded`,{method:'POST'}).catch(()=>{});};
  const finish=()=>{if(!keyAck)return;onDeployed();setStep('select');setTmpl(null);setCreds(null);setKeyAck(false);};

  if(step==='credentials'&&creds){
    const cmd=`ssh -i ${creds.sandboxId}-key.pem -p ${creds.sshPort} ${creds.sshUser}@<public-ip>`;
    return<div style={{maxWidth:640,margin:'0 auto'}}>
      <div style={{background:T.warningDim,border:`1px solid ${T.warning}`,borderRadius:10,padding:16,marginBottom:20,display:'flex',gap:12}}><AlertTriangle size={20} color={T.warning} style={{flexShrink:0,marginTop:2}}/><div><div style={{fontWeight:600,color:T.warning,fontSize:14,marginBottom:4}}>Save your private key now</div><div style={{color:T.text,fontSize:13,opacity:0.85}}>This key will not be shown again. Download or copy it before continuing.</div></div></div>
      <div style={{background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><span style={{fontSize:12,fontWeight:600,color:T.textMuted}}>PRIVATE KEY (ED25519)</span><div style={{display:'flex',gap:6}}><Btn T={T} variant="secondary" size="sm" onClick={downloadKey}><Download size={12}/> Download .pem</Btn><Btn T={T} variant="secondary" size="sm" onClick={()=>copyTxt(creds.privateKey,'pk')}>{copied==='pk'?<Check size={12}/>:<Copy size={12}/>} {copied==='pk'?'Copied':'Copy'}</Btn></div></div>
        <pre style={{margin:0,fontSize:11,color:T.textMuted,fontFamily:"'JetBrains Mono',monospace",whiteSpace:'pre-wrap',wordBreak:'break-all',maxHeight:120,overflow:'auto',background:T===CUSTOMER_THEME?'#f8fafc':'rgba(0,0,0,0.3)',padding:10,borderRadius:6}}>{creds.privateKey}</pre>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>{[['Algorithm','ED25519 256-bit'],['SSH Port',creds.sshPort],['Username',creds.sshUser],['Fingerprint',creds.fingerprint?.substring(0,24)+'...']].map(([k,v])=><div key={k} style={{background:T.bgInput,padding:'10px 14px',borderRadius:8,border:`1px solid ${T.borderSubtle}`}}><div style={{fontSize:10,color:T.textDim}}>{k}</div><div style={{fontSize:12,color:T.text,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div></div>)}</div>
      <div style={{background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><span style={{fontSize:11,color:T.textMuted,fontWeight:600}}>CONNECT COMMAND</span><Btn T={T} variant="ghost" size="sm" onClick={()=>copyTxt(cmd,'cmd')}>{copied==='cmd'?<Check size={12}/>:<Copy size={12}/>}</Btn></div><code style={{fontSize:12,color:T.primary,fontFamily:"'JetBrains Mono',monospace",wordBreak:'break-all'}}>{cmd}</code><div style={{fontSize:11,color:T.textMuted,marginTop:6}}>Note: Replace &lt;public-ip&gt; with the IP shown in your sandbox detail once deployment completes.</div></div>
      <div style={{background:T.bgInput,padding:'8px 14px',borderRadius:8,marginBottom:20}}><code style={{fontSize:11,color:T.textMuted}}>chmod 400 {creds.sandboxId}-key.pem</code></div>
      <label style={{display:'flex',gap:10,alignItems:'center',cursor:'pointer',marginBottom:20,padding:'12px 16px',background:keyAck?T.successDim:T.bgInput,border:`1px solid ${keyAck?T.success:T.border}`,borderRadius:10,transition:'all 0.2s'}}><input type="checkbox" checked={keyAck} onChange={e=>setKeyAck(e.target.checked)} style={{width:18,height:18,accentColor:T.primary}}/><span style={{fontSize:13,color:T.text,fontWeight:500}}>I have saved my private key securely</span></label>
      <Btn T={T} onClick={finish} disabled={!keyAck} size="lg" style={{width:'100%',justifyContent:'center'}}><CheckCircle size={16}/> Go to Dashboard</Btn>
    </div>;
  }

  if(step==='configure'&&tmpl){
    const inst=INSTANCES.find(i=>i.id===(instType||tmpl.recommended));
    const insufficient=inst&&credits<inst.priceHr;
    return<div style={{maxWidth:560,margin:'0 auto'}}>
      <Btn T={T} variant="ghost" size="sm" onClick={()=>{setStep('select');setTmpl(null);}} style={{marginBottom:16}}><ChevronLeft size={14}/> Back to templates</Btn>
      <div style={{fontSize:18,fontWeight:600,color:T.text,marginBottom:20}}>{tmpl.name}</div>
      <ErrorBox msg={error} T={T}/>
      <Select label="Instance Type" value={instType||tmpl.recommended} onChange={v=>setInstType(v)} T={T} options={INSTANCES.map(i=>({value:i.id,label:`${i.id} — ${i.vcpu} vCPU, ${i.mem}GB RAM — ${fmtCurrency(i.priceHr)}/hr`}))}/>
      <div style={{marginTop:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{background:T.bgInput,padding:'12px 14px',borderRadius:8}}><div style={{fontSize:10,color:T.textDim}}>HOURLY COST</div><div style={{fontSize:18,fontWeight:700,color:T.text}}>{inst?fmtCurrency(inst.priceHr):'—'}/hr</div></div>
        <div style={{background:T.bgInput,padding:'12px 14px',borderRadius:8}}><div style={{fontSize:10,color:T.textDim}}>ESTIMATED DAILY</div><div style={{fontSize:18,fontWeight:700,color:T.text}}>{inst?fmtCurrency(inst.priceHr*24):'—'}/day</div></div>
      </div>
      {credits!==undefined&&<div style={{marginTop:12,padding:'10px 14px',borderRadius:8,background:insufficient?T.dangerDim:T.successDim,border:`1px solid ${insufficient?T.danger:T.success}`}}><span style={{fontSize:12,color:insufficient?T.danger:T.success,fontWeight:500}}>{insufficient?`Insufficient credits (${fmtCurrency(credits)})`:`Credits: ${fmtCurrency(credits)} — est. ${Math.floor(credits/(inst?.priceHr||1))} hours`}</span></div>}
      <div style={{marginTop:16,padding:14,background:T.bgInput,borderRadius:8}}>
        <div style={{fontSize:11,fontWeight:600,color:T.textMuted,marginBottom:8}}>CONFIGURATION</div>
        {[['Security',tmpl.security_profile?.toUpperCase()],['SSH User',tmpl.ssh_user],['SSH Port',tmpl.ssh_port],['Max TTL',`${tmpl.max_ttl}h`],['Volume',`${tmpl.volume_size}GB ${tmpl.volume_type} (AES-256-GCM encrypted)`]].map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:12}}><span style={{color:T.textMuted}}>{k}</span><span style={{color:T.text,fontWeight:500}}>{v}</span></div>)}
      </div>
      <Btn T={T} onClick={doDeploy} size="lg" disabled={insufficient||deploying} style={{width:'100%',justifyContent:'center',marginTop:20}}>{deploying?<><RefreshCw size={16} style={{animation:'spin 1s linear infinite'}}/> Deploying...</>:<><Zap size={16}/> Deploy Sandbox</>}</Btn>
    </div>;
  }

  return<div>
    <div style={{fontSize:18,fontWeight:600,color:T.text,marginBottom:4}}>Deploy New Sandbox</div>
    <div style={{fontSize:13,color:T.textMuted,marginBottom:24}}>Select a preconfigured environment template</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280,1fr))',gap:16}}>
      {templates.filter(t=>t.enabled).map(t=>{const Icon=ICON_MAP[t.icon]||Server;const rec=INSTANCES.find(i=>i.id===t.recommended);return<div key={t.id} onClick={()=>{setTmpl(t);setInstType(t.recommended);setStep('configure');}} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:20,cursor:'pointer',transition:'all 0.2s',position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.transform='translateY(-2px)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform='none';}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:t.color}}/>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><div style={{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',background:`${t.color}20`}}><Icon size={20} color={t.color}/></div><div><div style={{fontWeight:600,color:T.text,fontSize:14}}>{t.name}</div><div style={{fontSize:11,color:T.textMuted}}>{t.security_profile?.toUpperCase()} security</div></div></div>
        <p style={{color:T.textMuted,fontSize:12,lineHeight:1.5,margin:'0 0 12px 0'}}>{t.description}</p>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:12}}>{(t.tags||[]).map(tag=><span key={tag} style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:T.bgInput,color:T.textMuted,border:`1px solid ${T.borderSubtle}`}}>{tag}</span>)}</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12}}><span style={{color:T.textMuted}}>Recommended: <span style={{color:T.text,fontWeight:500}}>{t.recommended}</span></span>{rec&&<span style={{color:t.color,fontWeight:600}}>{fmtCurrency(rec.priceHr)}/hr</span>}</div>
      </div>;})}
    </div>
  </div>;
}

// ═══════════════════════════════════════
//  SANDBOX DETAIL
// ═══════════════════════════════════════
function SandboxDetail({sandbox,T,onAction,showCustomer}){
  const[copied,setCopied]=useState('');const[acting,setActing]=useState('');
  const tmplName=sandbox.templateName||sandbox.template_id;const inst=INSTANCES.find(i=>i.id===sandbox.instance_type);
  const cmd=`ssh -i ${sandbox.id}-key.pem -p ${sandbox.ssh_port} ${sandbox.ssh_user}@${sandbox.public_ip||'<pending>'}`;
  const copyTxt=(txt,id)=>{navigator.clipboard.writeText(txt).catch(()=>{});setCopied(id);setTimeout(()=>setCopied(''),2000);};
  const doAction=async act=>{setActing(act);try{await onAction(act,sandbox.id);}finally{setActing('');}};
  const metrics=sandbox.metrics||{};let history=[];try{history=JSON.parse(metrics.history||'[]');}catch{}

  return<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
      <div><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}><span style={{fontSize:18,fontWeight:600,color:T.text}}>{tmplName}</span><StatusBadge status={sandbox.status} T={T}/></div><div style={{display:'flex',gap:16,fontSize:12,color:T.textMuted,flexWrap:'wrap'}}><span>ID: <span style={{fontFamily:"'JetBrains Mono',monospace",color:T.text}}>{sandbox.id}</span></span><span>{sandbox.instance_type} · {inst?.vcpu||'?'} vCPU · {inst?.mem||'?'}GB</span>{showCustomer&&<span>Customer: <span style={{color:T.text}}>{sandbox.customerName}</span></span>}{sandbox.public_ip&&<span>IP: <span style={{color:T.primary}}>{sandbox.public_ip}</span></span>}<span>Cost: <span style={{color:T.warning}}>{fmtCurrency(sandbox.cost_accrued)}</span></span></div></div>
      <div style={{display:'flex',gap:6}}>{sandbox.status==='running'&&<Btn T={T} variant="secondary" size="sm" onClick={()=>doAction('stop')} disabled={!!acting}><Square size={12}/>{acting==='stop'?'Stopping...':'Stop'}</Btn>}{sandbox.status==='stopped'&&<Btn T={T} variant="success" size="sm" onClick={()=>doAction('start')} disabled={!!acting}><Play size={12}/>{acting==='start'?'Starting...':'Start'}</Btn>}<Btn T={T} variant="danger" size="sm" onClick={()=>doAction('terminate')} disabled={!!acting}><Trash2 size={12}/>{acting==='terminate'?'...':'Terminate'}</Btn></div>
    </div>
    {sandbox.status!=='terminated'&&sandbox.public_ip&&<div style={{background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:8}}><Key size={14} color={T.primary}/><span style={{fontSize:13,fontWeight:600,color:T.text}}>SSH Access</span></div><span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:sandbox.key_downloaded?T.successDim:T.warningDim,color:sandbox.key_downloaded?T.success:T.warning}}>{sandbox.key_downloaded?'Key Downloaded':'Key Not Downloaded'}</span></div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><code style={{flex:1,fontSize:11,color:T.primary,fontFamily:"'JetBrains Mono',monospace",background:T===CUSTOMER_THEME?'#f1f5f9':'rgba(0,0,0,0.3)',padding:'8px 12px',borderRadius:6,wordBreak:'break-all'}}>{cmd}</code><Btn T={T} variant="ghost" size="sm" onClick={()=>copyTxt(cmd,'ssh')}>{copied==='ssh'?<Check size={14} color={T.success}/>:<Copy size={14}/>}</Btn></div>
      <div style={{display:'flex',gap:16,fontSize:11,color:T.textMuted}}><span>Port: {sandbox.ssh_port}</span><span>User: {sandbox.ssh_user}</span><span>Auth: ED25519 key-only</span>{sandbox.key_fingerprint&&<span>FP: {sandbox.key_fingerprint.substring(0,20)}...</span>}</div>
    </div>}
    {sandbox.status==='deploying'&&<div style={{padding:24,textAlign:'center',color:T.textMuted}}><RefreshCw size={24} style={{animation:'spin 1s linear infinite',marginBottom:8}}/><div>Instance is being provisioned... This typically takes 1-2 minutes.</div><div style={{fontSize:12,marginTop:8}}>Instance ID: {sandbox.instance_id||'pending'}</div></div>}
    {sandbox.status==='running'&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
      <MetricCard label="CPU" value={(metrics.cpu||0).toFixed(1)} unit="%" icon={Cpu} sparkData={history.map(h=>h.cpu)} T={T}/>
      <MetricCard label="Memory" value={(metrics.memory||0).toFixed(1)} unit="%" icon={MemoryStick} sparkData={history.map(h=>h.mem)} T={T}/>
      <MetricCard label="Network In" value={(metrics.net_in||0).toFixed(1)} unit="MB" icon={Wifi} T={T}/>
      <MetricCard label="Network Out" value={(metrics.net_out||0).toFixed(1)} unit="MB" icon={Activity} T={T}/>
      <MetricCard label="Disk" value={(metrics.disk||0).toFixed(1)} unit="%" icon={HardDrive} T={T}/>
      <MetricCard label="IOPS" value={(metrics.iops||0).toFixed(0)} unit="" icon={Zap} T={T}/>
    </div>}
    <div style={{display:'flex',gap:16,alignItems:'center'}}><ScoreRing score={sandbox.security_score||88} size={70} T={T}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 24px',fontSize:12}}><span style={{color:T.textMuted}}>Encryption: <span style={{color:T.success}}>AES-256-GCM</span></span><span style={{color:T.textMuted}}>Password Auth: <span style={{color:T.danger}}>Disabled</span></span><span style={{color:T.textMuted}}>Root Login: <span style={{color:T.danger}}>Disabled</span></span><span style={{color:T.textMuted}}>IMDSv2: <span style={{color:T.success}}>Required</span></span></div></div>
  </div>;
}

// ═══════════════════════════════════════
//  ADMIN PAGES
// ═══════════════════════════════════════
function AdminDash({T}){const[d,setD]=useState(null);const[err,setErr]=useState('');const load=useCallback(()=>{api('/admin/dashboard').then(setD).catch(e=>setErr(e.message));},[]);useEffect(()=>{load();const i=setInterval(load,15000);return()=>clearInterval(i);},[load]);if(!d)return<Loading T={T}/>;return<div style={{display:'flex',flexDirection:'column',gap:20}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:20,fontWeight:700,color:T.text}}>Platform Overview</div><InfraStatus T={T}/></div><ErrorBox msg={err} T={T}/><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}><MetricCard label="Running" value={d.running} icon={Server} T={T}/><MetricCard label="Customers" value={d.activeCustomers} icon={Users} T={T}/><MetricCard label="Revenue" value={fmtCurrency(d.totalRevenue)} icon={DollarSign} T={T}/><MetricCard label="Credits Pool" value={fmtCurrency(d.totalCredits)} icon={Wallet} T={T}/></div><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}><MetricCard label="Active vCPUs" value={d.totalVcpu} unit="cores" icon={Cpu} T={T}/><MetricCard label="Active Memory" value={d.totalMem} unit="GB" icon={MemoryStick} T={T}/><MetricCard label="Avg CPU" value={d.avgCpu.toFixed(1)} unit="%" icon={Activity} T={T}/><MetricCard label="Avg Memory" value={d.avgMem.toFixed(1)} unit="%" icon={BarChart3} T={T}/></div>
  <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:20}}><div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:14}}>Spend by Customer</div>{(d.customers||[]).map(c=>{const pct=c.total_allocated>0?((c.total_spent+c.currentSpend)/c.total_allocated)*100:0;return<div key={c.id} style={{display:'flex',alignItems:'center',gap:14,padding:'8px 0',borderBottom:`1px solid ${T.borderSubtle}`}}><div style={{width:120,fontSize:13,color:T.text,fontWeight:500}}>{c.name}</div><div style={{flex:1,height:8,background:T.bgInput,borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(pct,100)}%`,background:pct>80?T.danger:pct>60?T.warning:T.primary,borderRadius:4}}/></div><div style={{width:80,textAlign:'right',fontSize:12,fontWeight:600,color:T.text}}>{fmtCurrency(c.total_spent+c.currentSpend)}</div><div style={{width:80,textAlign:'right',fontSize:11,color:T.textMuted}}>of {fmtCurrency(c.total_allocated)}</div></div>;})}</div>
  <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:20}}><div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:14}}>Recent Activity</div>{(d.recentAudit||[]).map(e=><div key={e.id} style={{display:'flex',gap:12,padding:'7px 0',borderBottom:`1px solid ${T.borderSubtle}`,fontSize:12,alignItems:'center'}}><span style={{width:60,color:T.textDim,fontSize:10}}>{relTime(e.created_at)}</span><span style={{width:100,color:T.primary,fontWeight:500}}>{e.actor}</span><span style={{padding:'1px 6px',borderRadius:3,fontSize:10,fontWeight:600,background:T.primaryDim,color:T.primary}}>{e.action}</span><span style={{flex:1,color:T.textMuted}}>{e.detail}</span></div>)}</div></div>;}

function InfraStatus({T}){const[infra,setInfra]=useState(null);const[initing,setIniting]=useState(false);
  useEffect(()=>{api('/infra/status').then(setInfra).catch(()=>{});},[]);
  const init=async()=>{setIniting(true);try{await api('/infra/init',{method:'POST'});const s=await api('/infra/status');setInfra(s);}catch(e){alert('Init failed: '+e.message);}finally{setIniting(false);}};
  if(!infra)return null;
  if(!infra.initialized)return<Btn T={T} onClick={init} disabled={initing}><Settings size={14}/>{initing?'Initializing VPC...':'Initialize Infrastructure'}</Btn>;
  return<span style={{fontSize:11,color:T.success,display:'flex',alignItems:'center',gap:4}}><CheckCircle size={12}/> VPC: {infra.vpc_id}</span>;
}

function AdminCustomers({T}){const[custs,setCusts]=useState([]);const[showAdd,setShowAdd]=useState(false);const[showTopup,setShowTopup]=useState(null);const[newC,setNewC]=useState({name:'',email:'',company:'',credits:500});const[topAmt,setTopAmt]=useState(100);
  const load=()=>api('/admin/customers').then(setCusts).catch(()=>{});useEffect(()=>{load();},[]);
  const addCust=async()=>{try{const r=await api('/admin/customers',{method:'POST',body:JSON.stringify(newC)});alert(`Customer created!\nUsername: ${r.username}\nPassword: ${r.password}`);setShowAdd(false);setNewC({name:'',email:'',company:'',credits:500});load();}catch(e){alert(e.message);}};
  const topup=async()=>{if(!showTopup)return;try{await api(`/admin/customers/${showTopup.id}`,{method:'PUT',body:JSON.stringify({topup:topAmt})});setShowTopup(null);load();}catch(e){alert(e.message);}};
  const toggleStatus=async c=>{try{await api(`/admin/customers/${c.id}`,{method:'PUT',body:JSON.stringify({status:c.status==='active'?'suspended':'active'})});load();}catch(e){alert(e.message);}};
  return<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div style={{fontSize:20,fontWeight:700,color:T.text}}>Customer Management</div><Btn T={T} onClick={()=>setShowAdd(true)}><Plus size={14}/> Add Customer</Btn></div>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr style={{borderBottom:`1px solid ${T.border}`}}>{['Customer','Company','Status','Credits','Allocated','Spent','Sandboxes','Actions'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:T.textMuted,fontWeight:600,fontSize:11,textTransform:'uppercase'}}>{h}</th>)}</tr></thead><tbody>{custs.map(c=><tr key={c.id} style={{borderBottom:`1px solid ${T.borderSubtle}`}}><td style={{padding:'12px 16px'}}><div style={{fontWeight:500,color:T.text}}>{c.name}</div><div style={{fontSize:11,color:T.textDim}}>{c.email}</div></td><td style={{padding:'12px 16px',color:T.textMuted}}>{c.company}</td><td style={{padding:'12px 16px'}}><StatusBadge status={c.status} T={T}/></td><td style={{padding:'12px 16px',fontWeight:600,color:c.credits<50?T.danger:T.text}}>{fmtCurrency(c.credits)}</td><td style={{padding:'12px 16px',color:T.textMuted}}>{fmtCurrency(c.total_allocated)}</td><td style={{padding:'12px 16px',color:T.textMuted}}>{fmtCurrency(c.total_spent)}</td><td style={{padding:'12px 16px',color:T.text,fontWeight:500}}>{c.sandboxCount}</td><td style={{padding:'12px 16px'}}><div style={{display:'flex',gap:4}}><Btn T={T} variant="secondary" size="sm" onClick={()=>setShowTopup(c)}><DollarSign size={12}/> Top Up</Btn><Btn T={T} variant="ghost" size="sm" onClick={()=>toggleStatus(c)}>{c.status==='active'?<Lock size={12}/>:<Unlock size={12}/>}</Btn></div></td></tr>)}</tbody></table></div>
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New Customer" T={T}><div style={{display:'flex',flexDirection:'column',gap:14}}><Input label="Full Name" value={newC.name} onChange={v=>setNewC({...newC,name:v})} T={T}/><Input label="Email" value={newC.email} onChange={v=>setNewC({...newC,email:v})} T={T}/><Input label="Company" value={newC.company} onChange={v=>setNewC({...newC,company:v})} T={T}/><Input label="Initial Credits ($)" value={newC.credits} onChange={v=>setNewC({...newC,credits:parseFloat(v)||0})} T={T} type="number"/><Btn T={T} onClick={addCust} disabled={!newC.name||!newC.email}><Plus size={14}/> Create Customer</Btn></div></Modal>
    <Modal open={!!showTopup} onClose={()=>setShowTopup(null)} title={`Top Up — ${showTopup?.name}`} T={T}><div style={{display:'flex',flexDirection:'column',gap:14}}><div style={{padding:14,background:T.bgInput,borderRadius:8,fontSize:13}}><span style={{color:T.textMuted}}>Current Balance: </span><span style={{color:T.text,fontWeight:600}}>{fmtCurrency(showTopup?.credits||0)}</span></div><Input label="Amount ($)" value={topAmt} onChange={v=>setTopAmt(parseFloat(v)||0)} T={T} type="number"/><Btn T={T} onClick={topup}><DollarSign size={14}/> Add {fmtCurrency(topAmt)}</Btn></div></Modal>
  </div>;
}

function AdminSandboxes({T}){const[sbs,setSbs]=useState([]);const[filter,setFilter]=useState('all');const[sel,setSel]=useState(null);
  const load=()=>api('/admin/sandboxes').then(setSbs).catch(()=>{});useEffect(()=>{load();const i=setInterval(load,10000);return()=>clearInterval(i);},[]);
  const doAction=async(act,id)=>{try{await api(`/admin/sandboxes/${id}/${act}`,{method:'POST'});load();}catch(e){alert(e.message);}};
  const filtered=filter==='all'?sbs:sbs.filter(s=>s.status===filter);
  if(sel){const sb=sbs.find(s=>s.id===sel);if(!sb){setSel(null);return null;}return<div><Btn T={T} variant="ghost" size="sm" onClick={()=>setSel(null)} style={{marginBottom:16}}><ChevronLeft size={14}/> Back to Fleet</Btn><SandboxDetail sandbox={sb} T={T} onAction={doAction} showCustomer/></div>;}
  return<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div style={{fontSize:20,fontWeight:700,color:T.text}}>Sandbox Fleet</div><div style={{display:'flex',gap:4}}>{['all','running','stopped','deploying','terminated'].map(f=><Btn key={f} T={T} variant={filter===f?'primary':'secondary'} size="sm" onClick={()=>setFilter(f)} style={{textTransform:'capitalize'}}>{f} ({f==='all'?sbs.length:sbs.filter(s=>s.status===f).length})</Btn>)}</div></div>
    {filtered.length===0?<div style={{textAlign:'center',padding:40,color:T.textMuted}}>No sandboxes found</div>:
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr style={{borderBottom:`1px solid ${T.border}`}}>{['Sandbox','Customer','Template','Instance','Status','Cost','Security',''].map(h=><th key={h} style={{padding:'12px 14px',textAlign:'left',color:T.textMuted,fontWeight:600,fontSize:11,textTransform:'uppercase'}}>{h}</th>)}</tr></thead><tbody>{filtered.map(s=><tr key={s.id} style={{borderBottom:`1px solid ${T.borderSubtle}`,cursor:'pointer'}} onClick={()=>setSel(s.id)} onMouseEnter={e=>e.currentTarget.style.background=T.bgCardHover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><td style={{padding:'12px 14px',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:T.primary}}>{s.id}</td><td style={{padding:'12px 14px',color:T.text}}>{s.customerName}</td><td style={{padding:'12px 14px',color:T.textMuted}}>{s.templateName}</td><td style={{padding:'12px 14px',color:T.textMuted,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{s.instance_type}</td><td style={{padding:'12px 14px'}}><StatusBadge status={s.status} T={T}/></td><td style={{padding:'12px 14px',color:T.warning,fontWeight:500}}>{fmtCurrency(s.cost_accrued)}</td><td style={{padding:'12px 14px'}}><ScoreRing score={s.security_score||88} size={36} T={T}/></td><td style={{padding:'12px 14px'}}><ChevronRight size={14} color={T.textDim}/></td></tr>)}</tbody></table></div>}
  </div>;
}

function AdminAudit({T}){const[log,setLog]=useState([]);useEffect(()=>{api('/admin/audit').then(setLog).catch(()=>{});},[]);
  return<div><div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:20}}>Audit Log</div><div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{borderBottom:`1px solid ${T.border}`}}>{['Time','Actor','Action','Target','Detail'].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',color:T.textMuted,fontWeight:600,fontSize:10,textTransform:'uppercase'}}>{h}</th>)}</tr></thead><tbody>{log.map(e=><tr key={e.id} style={{borderBottom:`1px solid ${T.borderSubtle}`}}><td style={{padding:'10px 14px',color:T.textDim,fontFamily:"'JetBrains Mono',monospace",fontSize:10,whiteSpace:'nowrap'}}>{new Date(e.created_at).toLocaleString()}</td><td style={{padding:'10px 14px',color:T.primary,fontWeight:500}}>{e.actor}</td><td style={{padding:'10px 14px'}}><span style={{padding:'1px 6px',borderRadius:3,fontSize:10,fontWeight:600,background:T.primaryDim,color:T.primary}}>{e.action}</span></td><td style={{padding:'10px 14px',color:T.textMuted,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{e.target}</td><td style={{padding:'10px 14px',color:T.textMuted}}>{e.detail}</td></tr>)}</tbody></table></div></div>;
}

function AdminSecurity({T}){const[evts,setEvts]=useState([]);useEffect(()=>{api('/admin/security').then(setEvts).catch(()=>{});},[]);
  const ssh=evts.filter(e=>e.type==='ssh_attempt'),blocked=evts.filter(e=>e.type==='blocked_request'),anom=evts.filter(e=>e.type==='anomaly');
  const sevColor=s=>s==='danger'?T.danger:s==='warning'?T.warning:T.textMuted;
  return<div><div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:20}}>Security Operations</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}><MetricCard label="Events" value={evts.length} icon={ShieldCheck} T={T}/><MetricCard label="SSH Attempts" value={ssh.length} icon={Key} T={T}/><MetricCard label="Blocked" value={blocked.length} icon={ShieldAlert} T={T}/><MetricCard label="Anomalies" value={anom.length} icon={AlertTriangle} T={T}/></div>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:20}}><div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:14}}>Event Feed</div>{evts.map(ev=><div key={ev.id} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`1px solid ${T.borderSubtle}`,alignItems:'flex-start'}}><div style={{width:8,height:8,borderRadius:'50%',marginTop:5,flexShrink:0,background:sevColor(ev.severity)}}/><div style={{flex:1}}><div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}><span style={{fontSize:12,fontWeight:600,color:T.text}}>{ev.type?.replace('_',' ').toUpperCase()}</span><span style={{fontSize:10,color:T.textDim}}>{ev.sandbox_id}</span><span style={{fontSize:10,color:T.textDim}}>{relTime(ev.created_at)}</span></div><div style={{fontSize:12,color:T.textMuted}}>{ev.detail}</div></div><span style={{fontSize:10,padding:'2px 6px',borderRadius:3,fontWeight:600,background:ev.severity==='danger'?T.dangerDim:ev.severity==='warning'?T.warningDim:T.bgInput,color:sevColor(ev.severity)}}>{ev.severity?.toUpperCase()}</span></div>)}</div>
  </div>;
}

// ═══════════════════════════════════════
//  CUSTOMER PAGES
// ═══════════════════════════════════════
function CustDash({T}){const[d,setD]=useState(null);const load=useCallback(()=>{api('/customer/dashboard').then(setD).catch(()=>{});},[]);useEffect(()=>{load();const i=setInterval(load,10000);return()=>clearInterval(i);},[load]);if(!d)return<Loading T={T}/>;
  const c=d.customer;const hoursLeft=d.burnRate>0?c.credits/d.burnRate:Infinity;
  return<div style={{display:'flex',flexDirection:'column',gap:20}}>
    <div style={{fontSize:22,fontWeight:700,color:T.text}}>Welcome back, {c.name?.split(' ')[0]}</div>
    <div style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',borderRadius:16,padding:28,color:'#fff',position:'relative',overflow:'hidden'}}><div style={{position:'absolute',top:-30,right:-30,width:160,height:160,borderRadius:'50%',background:'rgba(255,255,255,0.08)'}}/><div style={{position:'relative',zIndex:1}}><div style={{fontSize:13,opacity:0.8,marginBottom:4}}>Available Credits</div><div style={{fontSize:40,fontWeight:700,marginBottom:8}}>{fmtCurrency(c.credits)}</div><div style={{display:'flex',gap:24,fontSize:13,opacity:0.85}}><span>Burn rate: {fmtCurrency(d.burnRate)}/hr</span><span>Remaining: {hoursLeft===Infinity?'∞':`${Math.floor(hoursLeft)}h`}</span></div>{c.credits<c.total_allocated*0.25&&<div style={{marginTop:12,padding:'8px 14px',borderRadius:8,background:'rgba(255,255,255,0.15)',fontSize:12,display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={14}/>{c.credits<c.total_allocated*0.1?'Credits critically low':'Credits running low'}</div>}</div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}><MetricCard label="Running" value={d.running} icon={Server} T={T}/><MetricCard label="Total" value={d.sandboxes?.length||0} icon={Box} T={T}/><MetricCard label="Spent" value={fmtCurrency(d.totalCost)} icon={CreditCard} T={T}/></div>
    {(d.sandboxes||[]).length>0&&<div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:20}}><div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:14}}>Your Sandboxes</div>{d.sandboxes.map(s=>{const Icon=ICON_MAP[s.icon]||Server;return<div key={s.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 0',borderBottom:`1px solid ${T.borderSubtle}`}}><Server size={18} color={T.primary}/><div style={{flex:1}}><div style={{fontWeight:500,color:T.text,fontSize:13}}>{s.templateName||s.template_id}</div><div style={{fontSize:11,color:T.textMuted}}>{s.instance_type} · {fmtCurrency(s.cost_accrued)}{s.public_ip?` · ${s.public_ip}`:''}</div></div><StatusBadge status={s.status} T={T}/></div>;})}</div>}
  </div>;
}

function CustSandboxes({T}){const[sbs,setSbs]=useState([]);const[sel,setSel]=useState(null);
  const load=()=>api('/customer/sandboxes').then(setSbs).catch(()=>{});useEffect(()=>{load();const i=setInterval(load,10000);return()=>clearInterval(i);},[]);
  const doAction=async(act,id)=>{try{await api(`/customer/sandboxes/${id}/${act}`,{method:'POST'});load();}catch(e){alert(e.message);}};
  if(sel){const sb=sbs.find(s=>s.id===sel);if(!sb){setSel(null);return null;}return<div><Btn T={T} variant="ghost" size="sm" onClick={()=>setSel(null)} style={{marginBottom:16}}><ChevronLeft size={14}/> Back</Btn><SandboxDetail sandbox={sb} T={T} onAction={doAction}/></div>;}
  return<div><div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:20}}>My Sandboxes</div>
    {sbs.length===0?<div style={{textAlign:'center',padding:60,color:T.textMuted}}><Box size={48} style={{margin:'0 auto 16px',opacity:0.3}}/><div>No active sandboxes</div></div>:
    <div style={{display:'grid',gap:12}}>{sbs.map(s=>{const inst=INSTANCES.find(i=>i.id===s.instance_type);const m=s.metrics||{};return<div key={s.id} onClick={()=>setSel(s.id)} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:18,cursor:'pointer',display:'flex',alignItems:'center',gap:16,transition:'all 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.primary;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}><Server size={22} color={T.primary}/><div style={{flex:1}}><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}><span style={{fontWeight:600,color:T.text,fontSize:14}}>{s.templateName||s.template_id}</span><StatusBadge status={s.status} T={T}/></div><div style={{display:'flex',gap:16,fontSize:12,color:T.textMuted}}><span>{s.instance_type}</span>{s.public_ip&&<span>{s.public_ip}</span>}<span style={{color:T.warning}}>{fmtCurrency(s.cost_accrued)}</span></div></div>{s.status==='running'&&<div style={{display:'flex',gap:16,alignItems:'center'}}><div style={{textAlign:'center'}}><div style={{fontSize:16,fontWeight:600,color:T.text}}>{(m.cpu||0).toFixed(0)}%</div><div style={{fontSize:10,color:T.textMuted}}>CPU</div></div><div style={{textAlign:'center'}}><div style={{fontSize:16,fontWeight:600,color:T.text}}>{(m.memory||0).toFixed(0)}%</div><div style={{fontSize:10,color:T.textMuted}}>MEM</div></div><ScoreRing score={s.security_score||88} size={44} T={T}/></div>}<ChevronRight size={16} color={T.textDim}/></div>;})}</div>}
  </div>;
}

function CustCredits({T}){const[d,setD]=useState(null);useEffect(()=>{api('/customer/credits').then(setD).catch(()=>{});},[]);if(!d)return<Loading T={T}/>;
  const c=d.customer;const usedPct=c.total_allocated>0?((c.total_allocated-c.credits)/c.total_allocated)*100:0;
  return<div><div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:20}}>Credit Overview</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}><MetricCard label="Balance" value={fmtCurrency(c.credits)} icon={Wallet} T={T}/><MetricCard label="Allocated" value={fmtCurrency(c.total_allocated)} icon={CreditCard} T={T}/><MetricCard label="Spent" value={fmtCurrency(c.total_spent)} icon={TrendingUp} T={T}/></div>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:20}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontSize:13,fontWeight:500,color:T.text}}>Usage</span><span style={{fontSize:13,color:T.textMuted}}>{usedPct.toFixed(1)}%</span></div><div style={{height:12,background:T.bgInput,borderRadius:6,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(usedPct,100)}%`,background:usedPct>85?`linear-gradient(90deg,${T.warning},${T.danger})`:`linear-gradient(90deg,${T.primary},${T.secondary})`,borderRadius:6}}/></div></div>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:20}}><div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:14}}>Active Charges</div>{(d.activeSandboxes||[]).length===0?<div style={{color:T.textMuted,fontSize:13,textAlign:'center',padding:16}}>No active charges</div>:(d.activeSandboxes||[]).map(s=><div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${T.borderSubtle}`}}><div><div style={{fontSize:13,color:T.text,fontWeight:500}}>{s.id}</div><div style={{fontSize:11,color:T.textMuted}}>{s.instance_type}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:13,color:T.warning,fontWeight:600}}>{fmtCurrency(s.priceHr)}/hr</div><div style={{fontSize:11,color:T.textMuted}}>Accrued: {fmtCurrency(s.cost_accrued)}</div></div></div>)}{(d.activeSandboxes||[]).length>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'12px 0 0',fontSize:13}}><span style={{fontWeight:600,color:T.text}}>Burn Rate</span><span style={{fontWeight:600,color:T.warning}}>{fmtCurrency(d.burnRate)}/hr</span></div>}</div>
  </div>;
}

// ═══════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════
export default function App(){
  const[user,setUser]=useState(()=>{const t=localStorage.getItem('token');if(!t)return null;try{const p=JSON.parse(atob(t.split('.')[1]));if(p.exp*1000<Date.now()){localStorage.removeItem('token');return null;}return p;}catch{return null;}});
  const[adminNav,setAdminNav]=useState('dashboard');const[custNav,setCustNav]=useState('dashboard');
  const[templates,setTemplates]=useState([]);
  const[needsSetup,setNeedsSetup]=useState(null); // null=loading, true=needs setup, false=ready

  useEffect(()=>{api('/setup/status').then(d=>setNeedsSetup(d.needsSetup)).catch(()=>setNeedsSetup(false));},[]);

  const loadTemplates=useCallback(()=>{if(!user)return;const path=user.role==='admin'?'/admin/templates':'/customer/templates';api(path).then(setTemplates).catch(()=>{});},[user]);
  useEffect(()=>{loadTemplates();},[loadTemplates]);

  const logout=()=>{localStorage.removeItem('token');setUser(null);setAdminNav('dashboard');setCustNav('dashboard');};
  if(needsSetup===null)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',color:'#94a3b8',fontFamily:'DM Sans,sans-serif'}}>Loading...</div>;
  if(needsSetup)return<SetupScreen onComplete={()=>setNeedsSetup(false)}/>;
  if(!user)return<LoginScreen onLogin={u=>{setUser(u);}}/>;

  const T=user.role==='admin'?ADMIN_THEME:CUSTOMER_THEME;
  const adminNavItems=[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'customers',label:'Customers',icon:Users},{id:'sandboxes',label:'Sandboxes',icon:Server},{id:'templates',label:'Templates',icon:Layers},{id:'security',label:'Security',icon:ShieldCheck},{id:'audit',label:'Audit Log',icon:ScrollText}];
  const custNavItems=[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'sandboxes',label:'My Sandboxes',icon:Server},{id:'deploy',label:'Deploy',icon:Zap},{id:'credits',label:'Credits',icon:Wallet}];
  const navItems=user.role==='admin'?adminNavItems:custNavItems;const activeNav=user.role==='admin'?adminNav:custNav;const setNav=user.role==='admin'?setAdminNav:setCustNav;

  const renderContent=()=>{
    if(user.role==='admin'){switch(adminNav){
      case'dashboard':return<AdminDash T={T}/>;
      case'customers':return<AdminCustomers T={T}/>;
      case'sandboxes':return<AdminSandboxes T={T}/>;
      case'templates':return<div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div style={{fontSize:20,fontWeight:700,color:T.text}}>Templates</div><Btn T={T} onClick={loadTemplates}><RefreshCw size={14}/> Refresh</Btn></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300,1fr))',gap:16}}>{templates.map(t=>{const Icon=ICON_MAP[t.icon]||Server;return<div key={t.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:20,position:'relative',opacity:t.enabled?1:0.5}}><div style={{position:'absolute',top:0,left:0,right:0,height:3,background:t.color}}/><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><div style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:`${t.color}20`}}><Icon size={18} color={t.color}/></div><div><div style={{fontWeight:600,color:T.text,fontSize:14}}>{t.name}</div><div style={{fontSize:11,color:T.textMuted}}>{t.security_profile?.toUpperCase()} · TTL {t.max_ttl}h</div></div></div><p style={{color:T.textMuted,fontSize:12,lineHeight:1.5,margin:'0 0 10px'}}>{t.description}</p><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(t.tags||[]).map(tag=><span key={tag} style={{padding:'2px 6px',borderRadius:3,fontSize:10,background:T.bgInput,color:T.textMuted}}>{tag}</span>)}</div><div style={{marginTop:10,fontSize:11,color:T.textDim}}>Recommended: {t.recommended} · {t.enabled?'Enabled':'Disabled'}</div></div>;})}</div></div>;
      case'security':return<AdminSecurity T={T}/>;
      case'audit':return<AdminAudit T={T}/>;
    }}else{switch(custNav){
      case'dashboard':return<CustDash T={T}/>;
      case'sandboxes':return<CustSandboxes T={T}/>;
      case'deploy':return<DeployFlow templates={templates} credits={0} T={T} onDeployed={()=>{setCustNav('sandboxes');loadTemplates();}}/>;
      case'credits':return<CustCredits T={T}/>;
    }}
  };

  // Fetch customer credits for deploy flow
  const[custCredits,setCustCredits]=useState(0);
  useEffect(()=>{if(user.role==='customer'){api('/customer/credits').then(d=>setCustCredits(d.customer?.credits||0)).catch(()=>{});}const i=setInterval(()=>{if(user.role==='customer')api('/customer/credits').then(d=>setCustCredits(d.customer?.credits||0)).catch(()=>{});},15000);return()=>clearInterval(i);},[user]);

  const renderContentFinal=()=>{
    if(user.role==='customer'&&custNav==='deploy')return<DeployFlow templates={templates} credits={custCredits} T={T} onDeployed={()=>{setCustNav('sandboxes');loadTemplates();}}/>;
    return renderContent();
  };

  return<div style={{display:'flex',height:'100vh',fontFamily:T.fontBody,background:T.bg,color:T.text,overflow:'hidden'}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    <div style={{width:240,background:T.bgSidebar,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
      <div style={{padding:'20px 18px',borderBottom:`1px solid ${T.border}`}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:T.primaryDim}}><Shield size={18} color={T.primary}/></div><div><div style={{fontSize:14,fontWeight:700,color:T.text}}>Sandbox Console</div><div style={{fontSize:10,color:T.textDim,textTransform:'uppercase',letterSpacing:0.5}}>{user.role==='admin'?'ADMIN':'CUSTOMER'}</div></div></div></div>
      <div style={{flex:1,padding:'12px 10px',display:'flex',flexDirection:'column',gap:2}}>{navItems.map(item=>{const Icon=item.icon;const active=activeNav===item.id;return<button key={item.id} onClick={()=>setNav(item.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:500,background:active?T.primaryDim:'transparent',color:active?T.primary:T.textMuted,transition:'all 0.15s'}}><Icon size={18}/>{item.label}</button>;})}</div>
      <div style={{padding:'14px 18px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontSize:12,fontWeight:500,color:T.text}}>{user.displayName}</div><div style={{fontSize:10,color:T.textDim}}>{user.username}</div></div><button onClick={logout} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}><LogOut size={16}/></button></div>
    </div>
    <div style={{flex:1,overflow:'auto',padding:28}}>{renderContentFinal()}</div>
  </div>;
}
