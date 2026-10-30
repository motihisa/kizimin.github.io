(() => {
"use strict";
const URL="https://bimddapbkdakspjaemsm.supabase.co";
const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const db=window.supabase?.createClient?.(URL,KEY);
let uid=null, roomId=null, channel=null, rooms=[], admins=[], selectedFile=null, pc=null, localStream=null, audioContext=null, pendingIce=[];
const status=(s)=>$("ac-call-status").textContent=s;
function showDenied(){ $("ac-loading").classList.add("hidden"); $("ac-denied").classList.remove("hidden"); }
async function init(){
 if(!db){showDenied();return;}
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.user?.id){showDenied();return;}
 uid=session.user.id;
 const {data:profile,error:pe}=await db.from("profiles").select("role,account_status,display_name,username").eq("id",uid).maybeSingle();
 if(pe||!profile||profile.account_status==="banned"||profile.account_status==="suspended"||profile.role!=="admin"){
   const {data:owner}=await db.from("site_owners").select("user_id").eq("user_id",uid).maybeSingle();
   if(!owner){showDenied();return;}
 }
 $("ac-loading").classList.add("hidden");$("ac-app").classList.remove("hidden");
 await loadRooms(); await loadAdmins(); subscribeSignals();
}
async function loadRooms(){
 const {data,error}=await db.from("admin_connect_rooms").select("id,name,room_type,created_at").order("created_at");
 if(error){$("ac-rooms").textContent="チャット一覧を取得できません: "+error.message;return;}
 rooms=data||[];
 $("ac-rooms").innerHTML=rooms.map(r=>'<button class="ac-room '+(r.id===roomId?'active':'')+'" data-id="'+r.id+'"><span>▤</span>'+esc(r.name)+'</button>').join("")||"チャットがありません";
 $("ac-rooms").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>openRoom(b.dataset.id));
 if(!roomId&&rooms[0]) await openRoom(rooms[0].id);
}
async function loadAdmins(){
 const {data,error}=await db.from("profiles").select("id,display_name,username,role").eq("role","admin").eq("account_status","active").order("display_name");
 if(error){$("ac-people").textContent="メンバーを取得できません";return;}
 admins=(data||[]).filter(p=>p.id!==uid);
 $("ac-people").innerHTML=admins.map(p=>'<div class="ac-person"><i></i><span>'+esc(p.display_name||p.username||"管理者")+'</span></div>').join("")||'<small>ほかの管理者はいません</small>';
 $("ac-call-target").innerHTML='<option value="">通話相手を選択</option>'+admins.map(p=>'<option value="'+p.id+'">'+esc(p.display_name||p.username||"管理者")+'</option>').join("");
}
async function openRoom(id){
 roomId=id;const room=rooms.find(r=>r.id===id);if(!room)return;
 $("ac-room-title").textContent=room.name;$("ac-room-subtitle").textContent="管理者間のリアルタイム連絡";
 $("ac-rooms").querySelectorAll(".ac-room").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
 if(channel) await db.removeChannel(channel);
 const {data,error}=await db.from("admin_connect_messages").select("id,room_id,sender_id,body,attachment_path,attachment_type,created_at,profiles:sender_id(display_name,username)").eq("room_id",id).order("created_at").limit(150);
 if(error){$("ac-messages").textContent="メッセージを取得できません: "+error.message;return;}
 renderMessages(data||[]);
 channel=db.channel("admin-connect-room-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_connect_messages",filter:"room_id=eq."+id},async payload=>{
  const {data:msg}=await db.from("admin_connect_messages").select("id,room_id,sender_id,body,attachment_path,attachment_type,created_at,profiles:sender_id(display_name,username)").eq("id",payload.new.id).maybeSingle();
  if(msg){appendMessage(msg);if(msg.sender_id!==uid&&$("ac-tts").checked&&msg.body) speak(msg.body);}
 }).subscribe();
}
function renderMessages(rows){$("ac-messages").innerHTML="";if(!rows.length){$("ac-messages").innerHTML='<div class="ac-empty">まだメッセージはありません。運営連絡を始めましょう。</div>';return;}rows.forEach(appendMessage);scrollBottom();}
async function appendMessage(m){
 const empty=$("ac-messages").querySelector(".ac-empty");if(empty)empty.remove();
 if($("ac-messages").querySelector('[data-message="'+m.id+'"]'))return;
 let attachment="";
 if(m.attachment_path){
  const {data}=await db.storage.from("admin-connect-files").createSignedUrl(m.attachment_path,3600);
  if(data?.signedUrl){attachment=m.attachment_type?.startsWith("image/")?'<a target="_blank" rel="noopener" href="'+data.signedUrl+'"><img class="ac-image" src="'+data.signedUrl+'" alt="添付画像"></a>':'<a class="ac-file-link" target="_blank" rel="noopener" href="'+data.signedUrl+'">📎 添付ファイルを開く</a>';}
 }
 const mine=m.sender_id===uid, name=m.profiles?.display_name||m.profiles?.username||(mine?"自分":"管理者");
 const el=document.createElement("article");el.className="ac-message "+(mine?"mine":"");el.dataset.message=m.id;
 el.innerHTML='<div class="ac-message-meta"><strong>'+esc(name)+'</strong><time>'+new Date(m.created_at).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+'</time></div>'+(m.body?'<p>'+esc(m.body).replace(/\n/g,"<br>")+'</p>':"")+attachment;
 $("ac-messages").append(el);scrollBottom();
}
function scrollBottom(){$("ac-messages").scrollTop=$("ac-messages").scrollHeight;}
$("ac-file").addEventListener("change",e=>{selectedFile=e.target.files?.[0]||null;if(selectedFile&&selectedFile.size>10*1024*1024){alert("ファイルは10MB以下にしてください");selectedFile=null;e.target.value="";} $("ac-attachment-preview").textContent=selectedFile?("添付: "+selectedFile.name):"";});
$("ac-compose").addEventListener("submit",async e=>{
 e.preventDefault();if(!roomId)return;const body=$("ac-message").value.trim();if(!body&&!selectedFile)return;
 $("ac-send").disabled=true;let path=null,type=null;
 try{
  if(selectedFile){const safe=selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);path=uid+"/"+crypto.randomUUID()+"-"+safe;type=selectedFile.type;
   const {error}=await db.storage.from("admin-connect-files").upload(path,selectedFile,{contentType:type,upsert:false});if(error)throw error;}
  const {error}=await db.from("admin_connect_messages").insert({room_id:roomId,sender_id:uid,body,attachment_path:path,attachment_type:type});if(error)throw error;
  $("ac-message").value="";$("ac-file").value="";selectedFile=null;$("ac-attachment-preview").textContent="";
 }catch(err){alert("送信に失敗しました: "+err.message);}finally{$("ac-send").disabled=false;}
});
$("ac-new-room").onclick=async()=>{const name=prompt("チャット名を入力してください");if(!name?.trim())return;const {data,error}=await db.from("admin_connect_rooms").insert({name:name.trim(),room_type:"text"}).select().single();if(error){alert("作成に失敗しました: "+error.message);return;}await loadRooms();await openRoom(data.id);};
function speak(text){if(!("speechSynthesis" in window))return;const u=new SpeechSynthesisUtterance(text);u.lang="ja-JP";speechSynthesis.speak(u);}
async function subscribeSignals(){
 db.channel("admin-connect-signals-"+uid).on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_connect_signals",filter:"recipient_id=eq."+uid},async p=>{await handleSignal(p.new);}).subscribe();
}
async function sendSignal(recipient,signal){const {error}=await db.from("admin_connect_signals").insert({room_id:roomId,sender_id:uid,recipient_id:recipient,signal});if(error)throw error;}
async function makePeer(target,isVideo){
 pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
 pc.onicecandidate=e=>{if(e.candidate)sendSignal(target,{type:"ice",candidate:e.candidate.toJSON()}).catch(console.error);};
 pc.ontrack=e=>{const stream=e.streams[0];$("ac-remote-video").srcObject=stream;$("ac-remote-audio").srcObject=stream;};
 pc.onconnectionstatechange=()=>status("通話状態: "+pc.connectionState);
 let stream=await navigator.mediaDevices.getUserMedia({audio:true,video:isVideo});
 localStream=stream;
 const effect=$("ac-voice-effect").value;
 if(effect!=="normal"&&window.AudioContext){
  audioContext=new AudioContext();const source=audioContext.createMediaStreamSource(stream),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain(),dest=audioContext.createMediaStreamDestination();
  filter.type=effect==="robot"?"bandpass":"lowshelf";filter.frequency.value=effect==="low"?220:effect==="high"?2200:900;filter.gain.value=effect==="high"?12:effect==="low"?-10:0;
  source.connect(filter).connect(gain).connect(dest);dest.stream.getAudioTracks().forEach(t=>pc.addTrack(t,dest.stream));stream.getVideoTracks().forEach(t=>pc.addTrack(t,stream));
 }else stream.getTracks().forEach(t=>pc.addTrack(t,stream));
 $("ac-local-video").srcObject=stream;
 return pc;
}
$("ac-call-start").onclick=async()=>{
 const target=$("ac-call-target").value;if(!target){alert("通話相手を選択してください");return;}
 try{$("ac-call-panel").classList.remove("hidden");status("発信中...");
  const isVideo=$("ac-call-video").dataset.mode==="video";await makePeer(target,isVideo);
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendSignal(target,{type:"offer",sdp:offer.sdp,video:isVideo});
 }catch(e){status("通話を開始できません: "+e.message);cleanupCall();}
};
$("ac-call-audio").onclick=()=>{$("ac-call-panel").classList.remove("hidden");$("ac-call-video").dataset.mode="audio";status("音声通話の相手を選択してください");};
$("ac-call-video").onclick=()=>{$("ac-call-panel").classList.remove("hidden");$("ac-call-video").dataset.mode="video";status("ビデオ通話の相手を選択してください");};
async function handleSignal(row){
 const s=row.signal;if(!s)return; roomId=row.room_id;
 try{
  if(s.type==="offer"){
   $("ac-call-panel").classList.remove("hidden");$("ac-call-video").dataset.mode=s.video?"video":"audio";$("ac-call-target").value=row.sender_id;
   if(!confirm("管理者から"+(s.video?"ビデオ":"音声")+"通話の着信です。応答しますか？")){await sendSignal(row.sender_id,{type:"reject"});return;}
   await makePeer(row.sender_id,!!s.video);await pc.setRemoteDescription({type:"offer",sdp:s.sdp}); for(const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
   const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await sendSignal(row.sender_id,{type:"answer",sdp:answer.sdp});status("通話中");
  }else if(s.type==="answer"&&pc){await pc.setRemoteDescription({type:"answer",sdp:s.sdp}); for(const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate); status("通話中");}
  else if(s.type==="ice"&&pc){if(pc.remoteDescription) await pc.addIceCandidate(s.candidate); else pendingIce.push(s.candidate);}
  else if(s.type==="reject"){status("相手が応答しませんでした");cleanupCall();}
  else if(s.type==="hangup"){status("相手が通話を終了しました");cleanupCall();}
 }catch(e){console.error(e);status("通話接続エラー: "+e.message);cleanupCall();}
}
function cleanupCall(){pendingIce=[];if(pc){pc.close();pc=null;}if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}if(audioContext){audioContext.close();audioContext=null;}$("ac-local-video").srcObject=null;$("ac-remote-video").srcObject=null;$("ac-remote-audio").srcObject=null;}
$("ac-call-hangup").onclick=async()=>{const target=$("ac-call-target").value;if(target)await sendSignal(target,{type:"hangup"}).catch(()=>{});cleanupCall();status("通話を終了しました");};
init();
})();