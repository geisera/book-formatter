"use client";
import {useEffect,useState} from "react";
export default function AuthCallback(){
 const [status,setStatus]=useState("Verifying your authentication link…");
 const [error,setError]=useState("");
 useEffect(()=>{
   let active=true;
   async function finish(){
     const fragment=new URLSearchParams(window.location.hash.slice(1));
     const query=new URLSearchParams(window.location.search);
     const err=fragment.get("error_description")||query.get("error_description")||fragment.get("error")||query.get("error");
     const confirmation=query.get("flow")==="confirm";
     const token=fragment.get("access_token");
     const expires=Number(fragment.get("expires_in")||3600);
     // Remove tokens immediately from the address bar and browser history.
     window.history.replaceState(null,"","/auth/callback/");
     if(err){if(active)setError(err);return;}
     if(!token){if(active)setError(confirmation?"This confirmation link is invalid or expired. Request another confirmation email.":"This link did not contain a sign-in token. Request a new magic link.");return;}
     try{
       const res=await fetch(confirmation?"/api/auth/verify-email":"/api/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({access_token:token,expires_in:expires}),cache:"no-store"});
       const data=await res.json() as {error?:string};
       if(!res.ok)throw Error(data.error||"Could not complete sign-in.");
       if(active){setStatus(confirmation?"Email verified. Opening sign-in…":"Sign-in successful. Opening your workspace…");window.location.replace(confirmation?"/auth/?confirmed=true":"/workspace/");}
     }catch(e){if(active)setError(e instanceof Error?e.message:"Could not complete sign-in.");}
   }
   void finish();return()=>{active=false;};
 },[]);
 return <main className="auth-page"><section className="auth-card"><p className="eyebrow">BOOK FORMATTER</p><h1>Verifying your email link</h1>{error?<><p role="alert" className="alert">{error}</p><a href="/auth/">Return to sign-in</a></>:<p role="status">{status}</p>}</section></main>;
}
