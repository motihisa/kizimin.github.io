import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

function b64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string) {
  const s = atob(value);
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function getCryptoKey(secret: string) {
  const material = new TextEncoder().encode("Kizimin AES-256-GCM v1:" + secret);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptText(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, data);
  return { ciphertext: b64(new Uint8Array(encrypted)), iv: b64(iv) };
}

async function decryptText(key: CryptoKey, ciphertext: string, iv: string) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv), tagLength: 128 },
    key,
    fromB64(ciphertext)
  );
  return new TextDecoder().decode(plain);
}

async function main(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secretKey) return json({ error: "SERVER_KEY_NOT_CONFIGURED" }, 500);

  const admin = createClient(url, secretKey);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "INVALID_SESSION" }, 401);

  const userId = authData.user.id;
  const { data: profile } = await admin.from("profiles").select("role,account_status").eq("id", userId).maybeSingle();
  const isStaff = ["admin","moderator"].includes(profile?.role) && (profile?.account_status || "active") === "active";

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const key = await getCryptoKey(secretKey);

  const isMember = async (conversationId: string) => {
    const { data } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
    return !!data;
  };

  const canViewArticle = async (articleId: string) => {
    const { data: article } = await admin.from("articles").select("id,status,visibility,author_id").eq("id", articleId).maybeSingle();
    if (!article || article.status !== "published") return false;
    if (isStaff || article.author_id === userId || article.visibility === "public") return true;
    const { data: allowed } = await admin.from("article_allowed_users").select("user_id").eq("article_id", articleId).eq("user_id", userId).maybeSingle();
    return !!allowed;
  };

  if (action === "notifications_list") {
    const { data, error } = await admin
      .from("notifications")
      .select("id,title,body,type,link_url,created_at,read_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ notifications: data || [] });
  }

  if (action === "notifications_mark_read") {
    const notificationId = body.notification_id ? String(body.notification_id) : "";
    let query = admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (notificationId) query = query.eq("id", notificationId);
    const { error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "dm_list") {
    const { data: memberships, error } = await admin.from("conversation_members").select("conversation_id,last_read_at").eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    const result = [];
    for (const membership of memberships || []) {
      const { data: conv } = await admin.from("conversations").select("id,created_at,updated_at").eq("id", membership.conversation_id).maybeSingle();
      if (!conv) continue;
      const { data: members, error: membersError } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
      if (membersError) return json({ error: membersError.message }, 500);
      const memberIds = (members || []).map(m => m.user_id).filter(Boolean);
      let profiles = [];
      if (memberIds.length) {
        const { data: profileRows, error: profileError } = await admin.from("profiles").select("id,username,display_name").in("id", memberIds);
        if (profileError) return json({ error: profileError.message }, 500);
        profiles = profileRows || [];
      }
      const profileById = new Map(profiles.map(p => [p.id, p]));
      const memberView = (members || []).map(m => ({ user_id: m.user_id, profiles: profileById.get(m.user_id) || null }));
      const { data: latest, error: latestError } = await admin.from("messages").select("id,sender_id,content,content_encrypted,content_iv,created_at").eq("conversation_id", conv.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (latestError) return json({ error: latestError.message }, 500);
      let preview = "";
      if (latest?.content_encrypted && latest?.content_iv) {
        try { preview = await decryptText(key, latest.content_encrypted, latest.content_iv); } catch { preview = "暗号化されたメッセージ"; }
      }
      result.push({ ...conv, last_read_at: membership.last_read_at, members: memberView, latest: latest ? { id: latest.id, sender_id: latest.sender_id, content: preview, created_at: latest.created_at } : null });
    }
    result.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return json({ conversations: result });
  }

  if (action === "dm_messages") {
    const conversationId = String(body.conversation_id || "");
    if (!conversationId || !(await isMember(conversationId))) return json({ error: "FORBIDDEN" }, 403);
    const { data, error } = await admin.from("messages").select("id,sender_id,content,content_encrypted,content_iv,created_at,edited_at").eq("conversation_id", conversationId).order("created_at",{ascending:true}).limit(500);
    if (error) return json({ error: error.message }, 500);
    const messages = [];
    for (const m of data || []) {
      let content = "";
      try { content = m.content_encrypted && m.content_iv ? await decryptText(key,m.content_encrypted,m.content_iv) : ""; } catch { content = "メッセージを復号できませんでした。"; }
      messages.push({ id:m.id, sender_id:m.sender_id, content, created_at:m.created_at, edited_at:m.edited_at });
    }
    await admin.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", userId);
    return json({ messages });
  }

  if (action === "dm_send") {
    const conversationId = String(body.conversation_id || "");
    const content = String(body.content || "").trim();
    if (!conversationId || !(await isMember(conversationId))) return json({ error: "FORBIDDEN" }, 403);
    if (!content || content.length > 5000) return json({ error: "INVALID_CONTENT" }, 400);
    const encrypted = await encryptText(key, content);
    const { data: message, error } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      content: "",
      content_encrypted: encrypted.ciphertext,
      content_iv: encrypted.iv
    }).select("id,sender_id,created_at").single();
    if (error) return json({ error: error.message }, 500);
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    const { data: recipients } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conversationId).neq("user_id", userId);
    if (recipients?.length) {
      await admin.from("notifications").insert(recipients.map(r => ({
        recipient_id: r.user_id,
        sender_id: userId,
        type: "message",
        title: "新しいDMが届きました",
        body: "Kiziminで新しいメッセージが届いています。",
        link_url: "dm.html?conversation=" + conversationId
      })));
    }
    return json({ message });
  }

  if (action === "dm_admin_conversations") {
    if (!isStaff) return json({ error: "ADMIN_REQUIRED" }, 403);
    const { data, error } = await admin.from("conversations").select("id,created_by,created_at,updated_at").order("updated_at",{ascending:false}).limit(500);
    if (error) return json({ error: error.message }, 500);
    const result = [];
    for (const conv of data || []) {
      const { data: members } = await admin.from("conversation_members").select("user_id,profiles:user_id(id,username,display_name)").eq("conversation_id",conv.id);
      result.push({...conv,members:members||[]});
    }
    return json({ conversations: result });
  }

  if (action === "dm_admin_messages") {
    if (!isStaff) return json({ error: "ADMIN_REQUIRED" }, 403);
    const conversationId = String(body.conversation_id || "");
    const { data, error } = await admin.from("messages").select("id,sender_id,content_encrypted,content_iv,created_at,edited_at").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(500);
    if (error) return json({ error: error.message }, 500);
    const messages = [];
    for (const m of data || []) {
      let content = "";
      try { content = await decryptText(key,m.content_encrypted,m.content_iv); } catch { content = "メッセージを復号できませんでした。"; }
      messages.push({id:m.id,sender_id:m.sender_id,content,created_at:m.created_at,edited_at:m.edited_at});
    }
    return json({ messages });
  }

  if (action === "dm_admin_delete_message") {
    if (!isStaff) return json({ error: "ADMIN_REQUIRED" }, 403);
    const messageId = String(body.message_id || "");
    if (!messageId) return json({ error: "INVALID_MESSAGE" },400);
    const { error } = await admin.from("messages").delete().eq("id",messageId);
    if (error) return json({ error:error.message },500);
    return json({ok:true});
  }

  if (action === "admin_comments_list") {
    if (!isStaff) return json({ error: "ADMIN_REQUIRED" }, 403);
    const { data, error } = await admin.from("comments").select("id,article_id,author_id,content,content_encrypted,content_iv,parent_id,status,created_at,edited_at,profiles:author_id(id,username,display_name)").order("created_at",{ascending:false}).limit(500);
    if (error) return json({ error:error.message },500);
    const comments = [];
    for (const c of data || []) {
      let content = "";
      try { content = c.content_encrypted && c.content_iv ? await decryptText(key,c.content_encrypted,c.content_iv) : ""; } catch { content = "コメントを復号できませんでした。"; }
      comments.push({...c,content});
    }
    return json({comments});
  }

  if (action === "comment_list") {
    const articleId = String(body.article_id || "");
    if (!articleId || !(await canViewArticle(articleId))) return json({ error:"FORBIDDEN" },403);
    const { data, error } = await admin.from("comments").select("id,article_id,author_id,content,content_encrypted,content_iv,parent_id,status,created_at,edited_at,profiles:author_id(id,username,display_name)").eq("article_id",articleId).order("created_at",{ascending:true}).limit(500);
    if (error) return json({ error:error.message },500);
    const comments = [];
    for (const c of data || []) {
      let content = "";
      try { content = c.content_encrypted && c.content_iv ? await decryptText(key,c.content_encrypted,c.content_iv) : ""; } catch { content = "コメントを復号できませんでした。"; }
      if (c.status === "visible" || isStaff || c.author_id === userId) comments.push({...c,content});
    }
    return json({comments});
  }

  if (action === "comment_add") {
    const articleId = String(body.article_id || "");
    const content = String(body.content || "").trim();
    const parentId = body.parent_id ? String(body.parent_id) : null;
    if (!articleId || !(await canViewArticle(articleId))) return json({error:"FORBIDDEN"},403);
    if (!content || content.length > 5000) return json({error:"INVALID_CONTENT"},400);
    const encrypted = await encryptText(key,content);
    const { data, error } = await admin.from("comments").insert({
      article_id:articleId, author_id:userId, parent_id:parentId, content:"",
      content_encrypted:encrypted.ciphertext, content_iv:encrypted.iv, status:"visible"
    }).select("id,article_id,author_id,parent_id,status,created_at").single();
    if (error) return json({error:error.message},500);
    return json({comment:data});
  }

  if (action === "comment_status") {
    if (!isStaff) return json({error:"ADMIN_REQUIRED"},403);
    const commentId = String(body.comment_id || "");
    const status = String(body.status || "");
    if (!["visible","hidden","deleted"].includes(status)) return json({error:"INVALID_STATUS"},400);
    const {error} = await admin.from("comments").update({status}).eq("id",commentId);
    if (error) return json({error:error.message},500);
    return json({ok:true});
  }

  if (action === "comment_delete") {
    const commentId = String(body.comment_id || "");
    const {data:comment}=await admin.from("comments").select("author_id").eq("id",commentId).maybeSingle();
    if (!comment || (!isStaff && comment.author_id !== userId)) return json({error:"FORBIDDEN"},403);
    const {error}=await admin.from("comments").delete().eq("id",commentId);
    if (error) return json({error:error.message},500);
    return json({ok:true});
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
}

Deno.serve(main);
