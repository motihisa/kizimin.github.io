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
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,account_status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("secure-content account status lookup failed:", profileError.message);
    return json({ error: "ACCOUNT_STATUS_CHECK_FAILED" }, 500);
  }
  if (!profile) return json({ error: "ACCOUNT_RESTRICTED" }, 403);

  // Only a verified site_owners row grants the account-status exception.
  // The admin role alone never bypasses BAN or suspension.
  const { data: actorOwnerRow, error: actorOwnerError } = await admin.from("site_owners")
    .select("user_id").eq("user_id", userId).maybeSingle();
  if (actorOwnerError) return json({ error: "OWNER_CHECK_FAILED" }, 500);
  const isOwner = !!actorOwnerRow;
  if ((profile.account_status || "active") !== "active" && !isOwner) {
    return json({ error: "ACCOUNT_RESTRICTED" }, 403);
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (authData.user.app_metadata?.must_change_password === true && action !== "complete_forced_password_change") {
    return json({ error: "PASSWORD_CHANGE_REQUIRED" }, 403);
  }
  const isStaff = !!profile && (isOwner || (
    ["admin","moderator"].includes(profile.role) &&
    (profile.account_status || "active") === "active"
  ));

  const hasPermission = async (permissionKey: string) => {
    if (!profile) return false;
    if (isOwner) return true;
    if ((profile.account_status || "active") !== "active") return false;
    const { data: override, error: overrideError } = await admin.from("user_permission_overrides")
      .select("allowed")
      .eq("user_id", userId)
      .eq("permission_key", permissionKey)
      .maybeSingle();
    if (overrideError) return false;
    if (override) return override.allowed === true;
    const { data, error } = await admin.from("role_permissions")
      .select("allowed")
      .eq("role", profile.role)
      .eq("permission_key", permissionKey)
      .maybeSingle();
    return !error && data?.allowed === true;
  };

  if (action === "complete_forced_password_change") {
    if (authData.user.app_metadata?.must_change_password !== true) return json({ ok: true });
    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...(authData.user.app_metadata || {}), must_change_password: false }
    });
    if (metadataError) return json({ error: "PASSWORD_POLICY_CLEAR_FAILED" }, 500);
    return json({ ok: true });
  }

  if (action === "admin_force_password_change" || action === "admin_send_password_reset") {
    const targetId = String(body.user_id || "");
    if (!targetId) return json({ error: "INVALID_USER" }, 400);
    if (targetId === userId && action === "admin_force_password_change") {
      return json({ error: "SELF_FORCE_CHANGE_NOT_ALLOWED" }, 400);
    }
    if (action === "admin_send_password_reset" && !isOwner) {
      return json({ error: "OWNER_REQUIRED" }, 403);
    }
    if (action === "admin_force_password_change" && !isOwner && profile.role !== "admin") {
      return json({ error: "ADMIN_REQUIRED" }, 403);
    }
    const { data: targetProfile, error: targetProfileError } = await admin
      .from("profiles").select("id,role").eq("id", targetId).maybeSingle();
    if (targetProfileError) return json({ error: "USER_LOOKUP_FAILED" }, 500);
    if (!targetProfile) return json({ error: "USER_NOT_FOUND" }, 404);
    if (!isOwner && ["admin", "owner"].includes(targetProfile.role)) {
      return json({ error: "TARGET_ROLE_PROTECTED" }, 403);
    }
    const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetId);
    if (targetAuthError || !targetAuth.user?.email) return json({ error: "EMAIL_LOOKUP_FAILED" }, 500);

    if (action === "admin_force_password_change") {
      const { error: updateError } = await admin.auth.admin.updateUserById(targetId, {
        app_metadata: { ...(targetAuth.user.app_metadata || {}), must_change_password: true }
      });
      if (updateError) return json({ error: "PASSWORD_POLICY_UPDATE_FAILED" }, 500);
      return json({ ok: true, email: targetAuth.user.email });
    }

    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
    if (!publishableKey) return json({ error: "PUBLISHABLE_KEY_NOT_CONFIGURED" }, 500);
    const response = await fetch(url + "/auth/v1/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publishableKey },
      body: JSON.stringify({ email: targetAuth.user.email, redirect_to: "https://kizimin-site.onrender.com/password-change.html" })
    });
    if (!response.ok) {
      console.error("Password reset email request failed:", response.status, await response.text());
      return json({ error: "PASSWORD_RESET_EMAIL_FAILED" }, 502);
    }
    return json({ ok: true, email: targetAuth.user.email });
  }

  if (action === "admin_user_details") {
    const { data: ownerRow, error: ownerError } = await admin.from("site_owners").select("user_id").eq("user_id", userId).maybeSingle();
    if (ownerError) return json({ error: "ADMIN_CHECK_FAILED" }, 500);
    const allowed = !!ownerRow || profile?.role === "admin" || (await hasPermission("ban_users")) || (await hasPermission("manage_roles"));
    if (!allowed) return json({ error: "ADMIN_REQUIRED" }, 403);
    const targetId = String(body.user_id || "");
    if (!targetId) return json({ error: "INVALID_USER" }, 400);
    const { data: targetProfile, error: targetError } = await admin.from("profiles").select("id").eq("id", targetId).maybeSingle();
    if (targetError) return json({ error: "USER_LOOKUP_FAILED" }, 500);
    if (!targetProfile) return json({ error: "USER_NOT_FOUND" }, 404);
    const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetId);
    if (targetAuthError) return json({ error: "EMAIL_LOOKUP_FAILED" }, 500);
    return json({ ok: true, email: targetAuth.user?.email || null });
  }

  const { data: encryptionSecret, error: encryptionKeyError } = await admin.rpc("get_kizimin_content_encryption_key");
  if (encryptionKeyError || typeof encryptionSecret !== "string" || encryptionSecret.length < 32) {
    return json({ error: "ENCRYPTION_KEY_NOT_CONFIGURED" }, 500);
  }
  const key = await getCryptoKey(encryptionSecret);
  const legacyKey = await getCryptoKey(secretKey);
  const decryptStoredText = async (ciphertext: string, iv: string) => {
    try {
      return await decryptText(key, ciphertext, iv);
    } catch {
      return await decryptText(legacyKey, ciphertext, iv);
    }
  };

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
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
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
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    return json({ ok: true });
  }

  if (action === "dm_list") {
    const { data: memberships, error } = await admin.from("conversation_members").select("conversation_id,last_read_at").eq("user_id", userId);
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    const result = [];
    for (const membership of memberships || []) {
      const { data: conv } = await admin.from("conversations").select("id,created_at,updated_at").eq("id", membership.conversation_id).maybeSingle();
      if (!conv) continue;
      const { data: members, error: membersError } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
      if (membersError) return json({ error: "INTERNAL_ERROR" }, 500);
      const memberIds = (members || []).map(m => m.user_id).filter(Boolean);
      let profiles = [];
      if (memberIds.length) {
        const { data: profileRows, error: profileError } = await admin.from("profiles").select("id,username,display_name").in("id", memberIds);
        if (profileError) return json({ error: "INTERNAL_ERROR" }, 500);
        profiles = profileRows || [];
      }
      const profileById = new Map(profiles.map(p => [p.id, p]));
      const memberView = (members || []).map(m => ({ user_id: m.user_id, profiles: profileById.get(m.user_id) || null }));
      const { data: latest, error: latestError } = await admin.from("messages").select("id,sender_id,content,content_encrypted,content_iv,created_at").eq("conversation_id", conv.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (latestError) return json({ error: "INTERNAL_ERROR" }, 500);
      let preview = "";
      if (latest?.content_encrypted && latest?.content_iv) {
        try { preview = await decryptStoredText(latest.content_encrypted, latest.content_iv); } catch { preview = "暗号化されたメッセージ"; }
      }
      result.push({ ...conv, last_read_at: membership.last_read_at, members: memberView, latest: latest ? { id: latest.id, sender_id: latest.sender_id, content: preview, created_at: latest.created_at } : null });
    }
    result.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return json({ conversations: result });
  }

  if (action === "dm_messages") {
    const conversationId = String(body.conversation_id || "");
    if (!conversationId || !(await isMember(conversationId))) return json({ error: "FORBIDDEN" }, 403);
    const { data, error } = await admin.from("messages").select("id,sender_id,content,content_encrypted,content_iv,created_at").eq("conversation_id", conversationId).order("created_at",{ascending:true}).limit(500);
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    const messages = [];
    for (const m of data || []) {
      let content = "";
      try { content = m.content_encrypted && m.content_iv ? await decryptStoredText(m.content_encrypted,m.content_iv) : ""; } catch { content = "メッセージを復号できませんでした。"; }
      messages.push({ id:m.id, sender_id:m.sender_id, content, created_at:m.created_at });
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
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
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

  if (action === "admin_comments_list") {
    if (!(await hasPermission("moderate_comments"))) return json({ error: "PERMISSION_DENIED" }, 403);
    const { data, error } = await admin.from("comments").select("id,article_id,author_id,content,content_encrypted,content_iv,parent_id,status,created_at,profiles:profiles!comments_author_id_fkey(id,username,display_name)").order("created_at",{ascending:false}).limit(500);
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    const comments = [];
    for (const c of data || []) {
      let content = "";
      try { content = c.content_encrypted && c.content_iv ? await decryptStoredText(c.content_encrypted,c.content_iv) : ""; } catch { content = "コメントを復号できませんでした。"; }
      comments.push({...c,content});
    }
    return json({comments});
  }

  if (action === "comment_list") {
    const articleId = String(body.article_id || "");
    if (!articleId || !(await canViewArticle(articleId))) return json({ error:"FORBIDDEN" },403);
    const { data, error } = await admin.from("comments").select("id,article_id,author_id,content,content_encrypted,content_iv,parent_id,status,created_at,profiles:profiles!comments_author_id_fkey(id,username,display_name)").eq("article_id",articleId).order("created_at",{ascending:true}).limit(500);
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    const comments = [];
    for (const c of data || []) {
      let content = "";
      try { content = c.content_encrypted && c.content_iv ? await decryptStoredText(c.content_encrypted,c.content_iv) : ""; } catch { content = "コメントを復号できませんでした。"; }
      if (c.status === "visible" || isStaff || c.author_id === userId) comments.push({...c,content});
    }
    const commentIds = comments.map(c => c.id);
    const likesByComment = new Map<string, { count: number; liked: boolean }>();
    for (const commentId of commentIds) likesByComment.set(commentId, { count: 0, liked: false });
    if (commentIds.length) {
      const { data: likeRows, error: likesError } = await admin.from("comment_likes")
        .select("comment_id,user_id").in("comment_id", commentIds).limit(10000);
      if (likesError) return json({ error: "COMMENT_LIKES_LOAD_FAILED" }, 500);
      for (const like of likeRows || []) {
        const item = likesByComment.get(like.comment_id);
        if (item) {
          item.count += 1;
          if (like.user_id === userId) item.liked = true;
        }
      }
    }
    return json({ comments: comments.map(c => ({
      ...c,
      like_count: likesByComment.get(c.id)?.count || 0,
      liked_by_me: likesByComment.get(c.id)?.liked || false
    })) });
  }

  if (action === "comment_add") {
    const articleId = String(body.article_id || "");
    const content = String(body.content || "").trim();
    const parentId = body.parent_id ? String(body.parent_id) : null;
    if (!(await hasPermission("write_content"))) return json({error:"PERMISSION_DENIED"},403);
    if (!articleId || !(await canViewArticle(articleId))) return json({error:"FORBIDDEN"},403);
    if (!content || content.length > 5000) return json({error:"INVALID_CONTENT"},400);
    const encrypted = await encryptText(key,content);
    const { data, error } = await admin.from("comments").insert({
      article_id:articleId, author_id:userId, parent_id:parentId, content:"[暗号化コメント]",
      content_encrypted:encrypted.ciphertext, content_iv:encrypted.iv, status:"visible"
    }).select("id,article_id,author_id,parent_id,status,created_at").single();
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    return json({comment:data});
  }

  if (action === "comment_like_toggle") {
    const commentId = String(body.comment_id || "");
    if (!commentId) return json({ error: "INVALID_COMMENT_ID" }, 400);
    if (!profile || (!isOwner && (profile.account_status || "active") !== "active")) return json({ error: "ACCOUNT_INACTIVE" }, 403);
    const { data: comment, error: commentError } = await admin.from("comments")
      .select("id,article_id,status").eq("id", commentId).maybeSingle();
    if (commentError) return json({ error: "COMMENT_LOOKUP_FAILED" }, 500);
    if (!comment || comment.status !== "visible") return json({ error: "COMMENT_NOT_AVAILABLE" }, 404);
    if (!(await canViewArticle(comment.article_id))) return json({ error: "FORBIDDEN" }, 403);
    const { data: existing, error: existingError } = await admin.from("comment_likes")
      .select("id").eq("comment_id", commentId).eq("user_id", userId).maybeSingle();
    if (existingError) return json({ error: "COMMENT_LIKE_LOOKUP_FAILED" }, 500);
    let liked = false;
    if (existing) {
      const { error } = await admin.from("comment_likes").delete().eq("id", existing.id).eq("user_id", userId);
      if (error) return json({ error: "COMMENT_UNLIKE_FAILED" }, 500);
    } else {
      const { error } = await admin.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
      if (error) return json({ error: "COMMENT_LIKE_FAILED" }, 500);
      liked = true;
    }
    const { count, error: countError } = await admin.from("comment_likes")
      .select("id", { count: "exact", head: true }).eq("comment_id", commentId);
    if (countError) return json({ error: "COMMENT_LIKE_COUNT_FAILED" }, 500);
    return json({ ok: true, liked, count: count || 0 });
  }

  if (action === "comment_status") {
    if (!(await hasPermission("moderate_comments"))) return json({error:"PERMISSION_DENIED"},403);
    const commentId = String(body.comment_id || "");
    const status = String(body.status || "");
    if (!["visible","hidden","deleted"].includes(status)) return json({error:"INVALID_STATUS"},400);
    const {error} = await admin.from("comments").update({status}).eq("id",commentId);
    if (error) return json({ error: "INTERNAL_ERROR" }, 500);
    return json({ok:true});
  }

  if (action === "comment_delete") {
    const commentId = String(body.comment_id || "");
    if (!commentId) return json({error:"INVALID_COMMENT_ID"},400);
    if (!(await hasPermission("moderate_comments"))) return json({error:"PERMISSION_DENIED"},403);
    const {data:comment,error:findError}=await admin.from("comments").select("id").eq("id",commentId).maybeSingle();
    if (findError) return json({error:"COMMENT_LOOKUP_FAILED"},500);
    if (!comment) return json({error:"COMMENT_NOT_FOUND"},404);
    const {data:deleted,error}=await admin.from("comments").delete().eq("id",commentId).select("id").maybeSingle();
    if (error) return json({error:"COMMENT_DELETE_FAILED"},500);
    if (!deleted) return json({error:"COMMENT_NOT_DELETED"},500);
    return json({ok:true});
  }

  if (action === "article_delete") {
    const articleId = String(body.article_id || "");
    if (!articleId) return json({error:"INVALID_ARTICLE_ID"},400);
    if (!isOwner && (profile?.account_status || "active") !== "active") return json({error:"ACCOUNT_INACTIVE"},403);
    const {data:ownerRow,error:ownerError}=await admin.from("site_owners").select("user_id").eq("user_id",userId).maybeSingle();
    const isOwner=!ownerError && !!ownerRow;
    if (!isOwner && profile?.role !== "admin") return json({error:"PERMISSION_DENIED"},403);
    const {data:article,error:findError}=await admin.from("articles").select("id,title").eq("id",articleId).maybeSingle();
    if (findError) return json({error:"ARTICLE_LOOKUP_FAILED"},500);
    if (!article) return json({error:"ARTICLE_NOT_FOUND"},404);
    const {data:deleted,error}=await admin.from("articles").delete().eq("id",articleId).select("id").maybeSingle();
    if (error) return json({error:"ARTICLE_DELETE_FAILED"},500);
    if (!deleted) return json({error:"ARTICLE_NOT_DELETED"},500);
    return json({ok:true});
  }


  if (action === "admin_user_activity") {
    const { data: ownerRow } = await admin.from("site_owners").select("user_id").eq("user_id", userId).maybeSingle();
    if (!isStaff && !ownerRow && !(await hasPermission("ban_users")) && !(await hasPermission("manage_roles")) && !(await hasPermission("delete_accounts"))) return json({ error: "ADMIN_REQUIRED" }, 403);
    const targetId = String(body.user_id || "");
    if (!targetId) return json({ error: "INVALID_USER" }, 400);
    const [{ data: reports, error: reportsError }, { data: notifications, error: notificationsError }] = await Promise.all([
      admin.from("reports").select("id,reason,status,created_at").eq("reporter_id", targetId).order("created_at", { ascending: false }).limit(30),
      admin.from("notifications").select("title,body,type,created_at").eq("recipient_id", targetId).order("created_at", { ascending: false }).limit(30)
    ]);
    if (reportsError || notificationsError) return json({ error: "USER_ACTIVITY_LOOKUP_FAILED" }, 500);
    const items = [
      ...(reports || []).map((r: any) => ({ kind: "通報履歴", title: "通報", body: String(r.reason || "") + " / 状態: " + String(r.status || "不明"), created_at: r.created_at })),
      ...(notifications || []).map((n: any) => ({ kind: "通知履歴", title: String(n.title || "通知"), body: String(n.body || ""), created_at: n.created_at }))
    ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 40);
    return json({ ok: true, items });
  }

  if (action === "admin_user_warning") {
    const { data: ownerRow } = await admin.from("site_owners").select("user_id").eq("user_id", userId).maybeSingle();
    if (!ownerRow && profile?.role !== "admin") return json({ error: "ADMIN_REQUIRED" }, 403);
    const targetId = String(body.user_id || "");
    const reason = String(body.reason || "").trim();
    const note = String(body.note || "").trim();
    if (!targetId || !reason || reason.length > 1000 || note.length > 2000) return json({ error: "INVALID_WARNING" }, 400);
    if (targetId === userId) return json({ error: "SELF_WARNING_NOT_ALLOWED" }, 400);
    const { data: target, error: targetError } = await admin.from("profiles").select("id,role").eq("id", targetId).maybeSingle();
    if (targetError) return json({ error: "USER_LOOKUP_FAILED" }, 500);
    if (!target) return json({ error: "USER_NOT_FOUND" }, 404);
    if (target.role === "owner") return json({ error: "OWNER_PROTECTED" }, 403);
    const warningBody = "運営からの警告です。\n理由: " + reason + (note ? "\n補足: " + note : "");
    const { error: notifyError } = await admin.from("notifications").insert({
      recipient_id: targetId,
      sender_id: userId,
      type: "system",
      title: "運営からの警告",
      body: warningBody,
      link_url: "notifications.html"
    });
    if (notifyError) return json({ error: "WARNING_DELIVERY_FAILED" }, 500);
    return json({ ok: true });
  }

  if (action === "admin_case_reply") {
    const { data: ownerRow } = await admin.from("site_owners").select("user_id").eq("user_id", userId).maybeSingle();
    if (!isStaff && !ownerRow) return json({ error: "ADMIN_REQUIRED" }, 403);
    const caseType = String(body.case_type || "");
    const caseId = String(body.case_id || "");
    const reply = String(body.reply || "").trim();
    if (!["inquiry", "report"].includes(caseType) || !caseId || !reply || reply.length > 4000) return json({ error: "INVALID_REPLY" }, 400);
    let recipientId = "";
    let title = "";
    if (caseType === "inquiry") {
      const { data: inquiry, error } = await admin.from("inquiries").select("id,user_id,subject").eq("id", caseId).maybeSingle();
      if (error) return json({ error: "CASE_LOOKUP_FAILED" }, 500);
      if (!inquiry?.user_id) return json({ error: "NO_LINKED_USER" }, 400);
      recipientId = inquiry.user_id;
      title = "お問い合わせへの返信: " + String(inquiry.subject || "お問い合わせ").slice(0, 180);
    } else {
      const { data: report, error } = await admin.from("reports").select("id,reporter_id").eq("id", caseId).maybeSingle();
      if (error) return json({ error: "CASE_LOOKUP_FAILED" }, 500);
      if (!report?.reporter_id) return json({ error: "NO_LINKED_USER" }, 400);
      recipientId = report.reporter_id;
      title = "通報への返信";
    }
    const { error: notifyError } = await admin.from("notifications").insert({
      recipient_id: recipientId, sender_id: userId, type: "system", title, body: reply, link_url: "notifications.html"
    });
    if (notifyError) return json({ error: "REPLY_DELIVERY_FAILED" }, 500);
    return json({ ok: true });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
}

Deno.serve(async (req: Request) => {
  try {
    return await main(req);
  } catch (error) {
    console.error("secure-content unhandled error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
