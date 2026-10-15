(() => {
"use strict";
if (window.__kiziminEmojiLoaded) return;
window.__kiziminEmojiLoaded = true;
const icons = {
"✍️":["write","M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5ZM13.8 6.7l3.5 3.5M4 20h16"],
"✍":["write","M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5ZM13.8 6.7l3.5 3.5M4 20h16"],
"📝":["note","M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6"],
"🏠":["home","M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"],
"🔔":["bell","M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
"💬":["chat","M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5ZM8 11h.01M12 11h.01M16 11h.01"],
"🔍":["search","M10.8 4a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l5 5"],
"❤️":["heart","M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"],
"⭐":["star","M12 2.8l2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.4l6.3-.9Z"],
"🏢":["building","M4 3h16v18H4zM8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"],
"👤":["user","M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2Z"],
"👥":["users","M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2ZM9.5 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"],
"🔒":["lock","M4 10h16v11H4zM8 10V7a4 4 0 1 1 8 0v3m-4 5v2"],
"📢":["announce","M3 11l18-6v14L3 13zM7 14l2 7h4l-2-6"],
"✉️":["mail","M3 5h18v14H3zM3 7l9 6 9-6"],
"🔗":["link","M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20l1.1-1.1"],
"⚠️":["warning","M12 3 22 20H2Z M12 9v5m0 3h.01"],
"❌":["cross","M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9l6 6m0-6-6 6"],
"✅":["check","M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM7 12l3.2 3.2L17 8"],
"💡":["idea","M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.7c.7.5 1 1.1 1 1.8h6c0-.7.3-1.3 1-1.8A7 7 0 0 0 12 2Z"],
"🚀":["rocket","M5 15c-2 0-3 2-3 5 3 0 5-1 5-3M7 13 4 12l4-5 5-2c2-2 5-3 8-3 0 3-1 6-3 8l-2 5-5 4-1-4Z M15 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"],
"📅":["calendar","M3 5h18v16H3zM16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"],
"📊":["chart","M4 20v-9h4v9M10 20V5h4v15M16 20V8h4v12M2 20h20"],
"🌱":["sprout","M12 21v-9m0 4c-6 0-8-4-8-9 5 0 8 2 8 7m0-2c0-6 3-9 8-9 0 5-2 9-8 9"],
"😊":["smile","M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 14s1.5 3 4 3 4-3 4-3M9 9h.01M15 9h.01"],
"🎁":["gift","M3 9h18v12H3zM2 6h20v4H2zM12 6v15M12 6S7 6 7 3c0-2 5-1 5 3Zm0 0s5 0 5-3c0-2-5-1-5 3Z"]
};
const aliases = new Map();
Object.keys(icons).forEach(k => aliases.set(k.replace(/\uFE0F/g, ""), icons[k]));
const keys = Object.keys(icons).sort((a,b)=>b.length-a.length);
const pattern = new RegExp(keys.map(s=>s.replace(/[.*+?^$()|[\]\\]/g,"\\$&")).join("|"),"gu");
const css = document.createElement("style");
css.textContent = ".kz-emoji{display:inline-flex;align-items:center;justify-content:center;vertical-align:-.19em;width:1.22em;height:1.22em;line-height:1;flex:0 0 auto}.kz-emoji svg{display:block;width:100%;height:100%;overflow:visible}.kz-emoji path{fill:#dcecff;stroke:#3178e8;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}.kz-emoji[data-kz=heart] path{fill:#ffc3d1;stroke:#e34d77}.kz-emoji[data-kz=star] path{fill:#ffe5a0;stroke:#e7a623}.kz-emoji[data-kz=check] path{fill:#b8f1d3;stroke:#1f9b69}.kz-emoji[data-kz=cross] path,.kz-emoji[data-kz=warning] path{fill:#ffd0d0;stroke:#d94d5b}";
document.head.appendChild(css);
function createIcon(emoji,item){const span=document.createElement("span");span.className="kz-emoji";span.dataset.kz=item[0];span.setAttribute("role","img");span.setAttribute("aria-label",emoji);const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",item[1]);svg.appendChild(path);span.appendChild(svg);return span;}
function skip(n){const p=n.parentElement;return !p||!!p.closest("script,style,textarea,input,select,option,code,pre,[contenteditable=true],.kz-emoji,.article-content,.markdown-body,.user-content,[data-no-custom-emoji]");}
function process(n){if(!n||n.nodeType!==Node.TEXT_NODE||skip(n))return;const text=n.nodeValue;pattern.lastIndex=0;if(!pattern.test(text)){pattern.lastIndex=0;return;}pattern.lastIndex=0;const frag=document.createDocumentFragment();let last=0,m;while((m=pattern.exec(text))){if(m.index>last)frag.appendChild(document.createTextNode(text.slice(last,m.index)));const item=icons[m[0]]||aliases.get(m[0].replace(/\uFE0F/g,""));frag.appendChild(item?createIcon(m[0],item):document.createTextNode(m[0]));last=m.index+m[0].length;}if(!last)return;if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));n.parentNode.replaceChild(frag,n);}
function walk(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(process);}
function start(){walk(document.body);new MutationObserver(records=>records.forEach(r=>{if(r.type==="characterData")process(r.target);(r.addedNodes||[]).forEach(n=>{if(n.nodeType===Node.TEXT_NODE)process(n);else if(n.nodeType===Node.ELEMENT_NODE&&!n.matches(".kz-emoji")&&!n.closest(".kz-emoji"))walk(n);});})).observe(document.body,{subtree:true,childList:true,characterData:true});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();