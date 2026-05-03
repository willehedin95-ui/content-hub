var de,k,Re,M,$e,Ge,Ve,fe,ne,J,We,xe,he,ge,se={},ue=[],lt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ce=Array.isArray;function N(e,t){for(var i in t)e[i]=t[i];return e}function ve(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function dt(e,t,i){var n,o,r,s={};for(r in t)r=="key"?n=t[r]:r=="ref"?o=t[r]:s[r]=t[r];if(arguments.length>2&&(s.children=arguments.length>3?de.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(r in e.defaultProps)s[r]===void 0&&(s[r]=e.defaultProps[r]);return re(e,s,n,o,null)}function re(e,t,i,n,o){var r={type:e,props:t,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Re,__i:-1,__u:0};return o==null&&k.vnode!=null&&k.vnode(r),r}function pe(e){return e.children}function oe(e,t){this.props=e,this.context=t}function V(e,t){if(t==null)return e.__?V(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?V(e):null}function ct(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,n=[],o=[],r=N({},t);r.__v=t.__v+1,k.vnode&&k.vnode(r),qe(e.__P,r,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,n,i??V(t),!!(32&t.__u),o),r.__v=t.__v,r.__.__k[r.__i]=r,Ke(n,r,o),t.__e=t.__=null,r.__e!=i&&Qe(r)}}function Qe(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Qe(e)}function Ie(e){(!e.__d&&(e.__d=!0)&&M.push(e)&&!le.__r++||$e!=k.debounceRendering)&&(($e=k.debounceRendering)||Ge)(le)}function le(){try{for(var e,t=1;M.length;)M.length>t&&M.sort(Ve),e=M.shift(),t=M.length,ct(e)}finally{M.length=le.__r=0}}function Ze(e,t,i,n,o,r,s,a,c,l,f){var u,h,p,y,_,w,b,v=n&&n.__k||ue,z=t.length;for(c=pt(i,t,v,c,z),u=0;u<z;u++)(p=i.__k[u])!=null&&(h=p.__i!=-1&&v[p.__i]||se,p.__i=u,w=qe(e,p,h,o,r,s,a,c,l,f),y=p.__e,p.ref&&h.ref!=p.ref&&(h.ref&&ye(h.ref,null,p),f.push(p.ref,p.__c||y,p)),_==null&&y!=null&&(_=y),(b=!!(4&p.__u))||h.__k===p.__k?(c=Je(p,c,e,b),b&&h.__e&&(h.__e=null)):typeof p.type=="function"&&w!==void 0?c=w:y&&(c=y.nextSibling),p.__u&=-7);return i.__e=_,c}function pt(e,t,i,n,o){var r,s,a,c,l,f=i.length,u=f,h=0;for(e.__k=new Array(o),r=0;r<o;r++)(s=t[r])!=null&&typeof s!="boolean"&&typeof s!="function"?(typeof s=="string"||typeof s=="number"||typeof s=="bigint"||s.constructor==String?s=e.__k[r]=re(null,s,null,null,null):ce(s)?s=e.__k[r]=re(pe,{children:s},null,null,null):s.constructor===void 0&&s.__b>0?s=e.__k[r]=re(s.type,s.props,s.key,s.ref?s.ref:null,s.__v):e.__k[r]=s,c=r+h,s.__=e,s.__b=e.__b+1,a=null,(l=s.__i=ft(s,i,c,u))!=-1&&(u--,(a=i[l])&&(a.__u|=2)),a==null||a.__v==null?(l==-1&&(o>f?h--:o<f&&h++),typeof s.type!="function"&&(s.__u|=4)):l!=c&&(l==c-1?h--:l==c+1?h++:(l>c?h--:h++,s.__u|=4))):e.__k[r]=null;if(u)for(r=0;r<f;r++)(a=i[r])!=null&&(2&a.__u)==0&&(a.__e==n&&(n=V(a)),Ye(a,a));return n}function Je(e,t,i,n){var o,r;if(typeof e.type=="function"){for(o=e.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=e,t=Je(o[r],t,i,n));return t}e.__e!=t&&(n&&(t&&e.type&&!t.parentNode&&(t=V(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function ft(e,t,i,n){var o,r,s,a=e.key,c=e.type,l=t[i],f=l!=null&&(2&l.__u)==0;if(l===null&&a==null||f&&a==l.key&&c==l.type)return i;if(n>(f?1:0)){for(o=i-1,r=i+1;o>=0||r<t.length;)if((l=t[s=o>=0?o--:r++])!=null&&(2&l.__u)==0&&a==l.key&&c==l.type)return s}return-1}function Pe(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||lt.test(t)?i:i+"px"}function ie(e,t,i,n,o){var r,s;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof n=="string"&&(e.style.cssText=n=""),n)for(t in n)i&&t in i||Pe(e.style,t,"");if(i)for(t in i)n&&i[t]==n[t]||Pe(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")r=t!=(t=t.replace(We,"$1")),s=t.toLowerCase(),t=s in e||t=="onFocusOut"||t=="onFocusIn"?s.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+r]=i,i?n?i[J]=n[J]:(i[J]=xe,e.addEventListener(t,r?ge:he,r)):e.removeEventListener(t,r?ge:he,r);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function Te(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[ne]==null)t[ne]=xe++;else if(t[ne]<i[J])return;return i(k.event?k.event(t):t)}}}function qe(e,t,i,n,o,r,s,a,c,l){var f,u,h,p,y,_,w,b,v,z,I,$,ee,G,W,A=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(c=!!(32&i.__u),r=[a=t.__e=i.__e]),(f=k.__b)&&f(t);e:if(typeof A=="function")try{if(b=t.props,v=A.prototype&&A.prototype.render,z=(f=A.contextType)&&n[f.__c],I=f?z?z.props.value:f.__:n,i.__c?w=(u=t.__c=i.__c).__=u.__E:(v?t.__c=u=new A(b,I):(t.__c=u=new oe(b,I),u.constructor=A,u.render=mt),z&&z.sub(u),u.state||(u.state={}),u.__n=n,h=u.__d=!0,u.__h=[],u._sb=[]),v&&u.__s==null&&(u.__s=u.state),v&&A.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=N({},u.__s)),N(u.__s,A.getDerivedStateFromProps(b,u.__s))),p=u.props,y=u.state,u.__v=t,h)v&&A.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),v&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(v&&A.getDerivedStateFromProps==null&&b!==p&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(b,I),t.__v==i.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(b,u.__s,I)===!1){t.__v!=i.__v&&(u.props=b,u.state=u.__s,u.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(U){U&&(U.__=t)}),ue.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&s.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(b,u.__s,I),v&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(p,y,_)})}if(u.context=I,u.props=b,u.__P=e,u.__e=!1,$=k.__r,ee=0,v)u.state=u.__s,u.__d=!1,$&&$(t),f=u.render(u.props,u.state,u.context),ue.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,$&&$(t),f=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++ee<25);u.state=u.__s,u.getChildContext!=null&&(n=N(N({},n),u.getChildContext())),v&&!h&&u.getSnapshotBeforeUpdate!=null&&(_=u.getSnapshotBeforeUpdate(p,y)),G=f!=null&&f.type===pe&&f.key==null?Xe(f.props.children):f,a=Ze(e,ce(G)?G:[G],t,i,n,o,r,s,a,c,l),u.base=t.__e,t.__u&=-161,u.__h.length&&s.push(u),w&&(u.__E=u.__=null)}catch(U){if(t.__v=null,c||r!=null)if(U.then){for(t.__u|=c?160:128;a&&a.nodeType==8&&a.nextSibling;)a=a.nextSibling;r[r.indexOf(a)]=null,t.__e=a}else{for(W=r.length;W--;)ve(r[W]);be(t)}else t.__e=i.__e,t.__k=i.__k,U.then||be(t);k.__e(U,t,i)}else r==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):a=t.__e=_t(i.__e,t,i,n,o,r,s,c,l);return(f=k.diffed)&&f(t),128&t.__u?void 0:a}function be(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(be))}function Ke(e,t,i){for(var n=0;n<i.length;n++)ye(i[n],i[++n],i[++n]);k.__c&&k.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(r){r.call(o)})}catch(r){k.__e(r,o.__v)}})}function Xe(e){return typeof e!="object"||e==null||e.__b>0?e:ce(e)?e.map(Xe):N({},e)}function _t(e,t,i,n,o,r,s,a,c){var l,f,u,h,p,y,_,w=i.props||se,b=t.props,v=t.type;if(v=="svg"?o="http://www.w3.org/2000/svg":v=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((p=r[l])&&"setAttribute"in p==!!v&&(v?p.localName==v:p.nodeType==3)){e=p,r[l]=null;break}}if(e==null){if(v==null)return document.createTextNode(b);e=document.createElementNS(o,v,b.is&&b),a&&(k.__m&&k.__m(t,r),a=!1),r=null}if(v==null)w===b||a&&e.data==b||(e.data=b);else{if(r=r&&de.call(e.childNodes),!a&&r!=null)for(w={},l=0;l<e.attributes.length;l++)w[(p=e.attributes[l]).name]=p.value;for(l in w)p=w[l],l=="dangerouslySetInnerHTML"?u=p:l=="children"||l in b||l=="value"&&"defaultValue"in b||l=="checked"&&"defaultChecked"in b||ie(e,l,null,p,o);for(l in b)p=b[l],l=="children"?h=p:l=="dangerouslySetInnerHTML"?f=p:l=="value"?y=p:l=="checked"?_=p:a&&typeof p!="function"||w[l]===p||ie(e,l,p,w[l],o);if(f)a||u&&(f.__html==u.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(u&&(e.innerHTML=""),Ze(t.type=="template"?e.content:e,ce(h)?h:[h],t,i,n,v=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,s,r?r[0]:i.__k&&V(i,0),a,c),r!=null)for(l=r.length;l--;)ve(r[l]);a||(l="value",v=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[l]||v=="progress"&&!y||v=="option"&&y!=w[l])&&ie(e,l,y,w[l],o),l="checked",_!=null&&_!=e[l]&&ie(e,l,_,w[l],o))}return e}function ye(e,t,i){try{if(typeof e=="function"){var n=typeof e.__u=="function";n&&e.__u(),n&&t==null||(e.__u=e(t))}else e.current=t}catch(o){k.__e(o,i)}}function Ye(e,t,i){var n,o;if(k.unmount&&k.unmount(e),(n=e.ref)&&(n.current&&n.current!=e.__e||ye(n,null,t)),(n=e.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){k.__e(r,t)}n.base=n.__P=null}if(n=e.__k)for(o=0;o<n.length;o++)n[o]&&Ye(n[o],t,i||typeof e.type!="function");i||ve(e.__e),e.__c=e.__=e.__e=void 0}function mt(e,t,i){return this.constructor(e,i)}function ht(e,t,i){var n,o,r,s;t==document&&(t=document.documentElement),k.__&&k.__(e,t),o=(n=!1)?null:t.__k,r=[],s=[],qe(t,e=t.__k=dt(pe,null,[e]),o||se,se,t.namespaceURI,o?null:t.firstChild?de.call(t.childNodes):null,r,o?o.__e:t.firstChild,n,s),Ke(r,e,s)}de=ue.slice,k={__e:function(e,t,i,n){for(var o,r,s;t=t.__;)if((o=t.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(e)),s=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,n||{}),s=o.__d),s)return o.__E=o}catch(a){e=a}throw e}},Re=0,oe.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=N({},this.state),typeof e=="function"&&(e=e(N({},i),this.props)),e&&N(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),Ie(this))},oe.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Ie(this))},oe.prototype.render=pe,M=[],Ge=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ve=function(e,t){return e.__v.__b-t.__v.__b},le.__r=0,fe=Math.random().toString(8),ne="__d"+fe,J="__a"+fe,We=/(PointerCapture)$|Capture$/i,xe=0,he=Te(!1),ge=Te(!0);var gt=0;function d(e,t,i,n,o,r){t||(t={});var s,a,c=t;if("ref"in c)for(a in c={},t)a=="ref"?s=t[a]:c[a]=t[a];var l={type:e,props:c,key:i,ref:s,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--gt,__i:-1,__u:0,__source:o,__self:r};if(typeof e=="function"&&(s=e.defaultProps))for(a in s)c[a]===void 0&&(c[a]=s[a]);return k.vnode&&k.vnode(l),l}var K,S,_e,Ee,X=0,et=[],C=k,Fe=C.__b,Ae=C.__r,Le=C.diffed,je=C.__c,Ne=C.unmount,Oe=C.__;function we(e,t){C.__h&&C.__h(S,e,X||t),X=0;var i=S.__H||(S.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function E(e){return X=1,bt(nt,e)}function bt(e,t,i){var n=we(K++,2);if(n.t=e,!n.__c&&(n.__=[nt(void 0,t),function(a){var c=n.__N?n.__N[0]:n.__[0],l=n.t(c,a);c!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=S,!S.__f)){var o=function(a,c,l){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(h){return h.__c});if(f.every(function(h){return!h.__N}))return!r||r.call(this,a,c,l);var u=n.__c.props!==a;return f.some(function(h){if(h.__N){var p=h.__[0];h.__=h.__N,h.__N=void 0,p!==h.__[0]&&(u=!0)}}),r&&r.call(this,a,c,l)||u};S.__f=!0;var r=S.shouldComponentUpdate,s=S.componentWillUpdate;S.componentWillUpdate=function(a,c,l){if(this.__e){var f=r;r=void 0,o(a,c,l),r=f}s&&s.call(this,a,c,l)},S.shouldComponentUpdate=o}return n.__N||n.__}function F(e,t){var i=we(K++,3);!C.__s&&it(i.__H,t)&&(i.__=e,i.u=t,S.__H.__h.push(i))}function O(e){return X=5,tt(function(){return{current:e}},[])}function tt(e,t){var i=we(K++,7);return it(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function H(e,t){return X=8,tt(function(){return e},t)}function zt(){for(var e;e=et.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(ae),t.__h.some(ze),t.__h=[]}catch(i){t.__h=[],C.__e(i,e.__v)}}}C.__b=function(e){S=null,Fe&&Fe(e)},C.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Oe&&Oe(e,t)},C.__r=function(e){Ae&&Ae(e),K=0;var t=(S=e.__c).__H;t&&(_e===S?(t.__h=[],S.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(ae),t.__h.some(ze),t.__h=[],K=0)),_e=S},C.diffed=function(e){Le&&Le(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(et.push(t)!==1&&Ee===C.requestAnimationFrame||((Ee=C.requestAnimationFrame)||xt)(zt)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),_e=S=null},C.__c=function(e,t){t.some(function(i){try{i.__h.some(ae),i.__h=i.__h.filter(function(n){return!n.__||ze(n)})}catch(n){t.some(function(o){o.__h&&(o.__h=[])}),t=[],C.__e(n,i.__v)}}),je&&je(e,t)},C.unmount=function(e){Ne&&Ne(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(n){try{ae(n)}catch(o){t=o}}),i.__H=void 0,t&&C.__e(t,i.__v))};var Ue=typeof requestAnimationFrame=="function";function xt(e){var t,i=function(){clearTimeout(n),Ue&&cancelAnimationFrame(t),setTimeout(e)},n=setTimeout(i,35);Ue&&(t=requestAnimationFrame(i))}function ae(e){var t=S,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),S=t}function ze(e){var t=S;e.__c=e.__(),S=t}function it(e,t){return!e||e.length!==t.length||t.some(function(i,n){return i!==e[n]})}function nt(e,t){return typeof t=="function"?t(e):t}function vt(e){const t=e.reduce((n,o)=>n+(o.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const n of e)if(i-=n.trafficPct??0,i<=0)return n;return e[e.length-1]}function qt(e,t){const i={};for(const o of Object.values(e.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const s=`quiz_${t}_vg_${o}`,a=localStorage.getItem(s);if(a&&e.nodes[a])n[o]=a;else{const c=vt(r);localStorage.setItem(s,c.id),n[o]=c.id}}return n}function yt(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function wt(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function R(e,t,i,n,o){const r=yt(e,t);if(r.length===0)return null;if(i!==null){const a=r.find(c=>wt(c.condition,i,n));if(a)return He(e,a.to,o)}const s=r.find(a=>!a.condition||a.condition.kind==="default")??r[0];return He(e,s.to,o)}function He(e,t,i){const n=e.nodes[t];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return e.nodes[o]??n}return n}function kt(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function St(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=e.get(n);o&&(t[n]=o)}return t}class Ct{constructor(t,i){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function $t(e,t,i,n,o){const r=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function It(e,t,i){const n={session_id:t,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function Pt(e,t,i,n){const o=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const Tt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function L(e,t){const i=t??"en",n=Tt[e];return i in n?n[i]:n.en}function rt(e){if(!e)return;const t=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))t(o)};for(const i of Array.from(e.children))t(i)}function me(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Et(e){if(!e)return e;const t=e.slice(-1).toLowerCase();return t==="s"||t==="x"||t==="z"?e:e+"s"}const Me={name:"Din valp",breed:"din valp",primary_pain:"beteendeproblem",primary_pain_value:"beteendet",problem_duration:"ett tag",upcoming_event_value:"",time_per_day:"10 min/dag"};function Be(e,t){if(t!=null&&t.trim()!=="")return t;if(e in Me)return Me[e]}function Y(e,t){return e.includes("{")?e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{if(n.endsWith("_pos")){const s=n.slice(0,-4),a=t?.[s],c=Be(s,a);return c==null?i:me(c==="Din valp"?"Din valps":Et(c))}const o=t?.[n],r=Be(n,o);return r==null?i:me(r)}):e}function Ft({el:e,variables:t}){const i=O(null),n=Y(e.text,t);return F(()=>{i.current&&(i.current.innerHTML=n,rt(i.current))},[n]),d("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function At({el:e,variables:t}){const i=O(null),n=Y(e.text,t);return F(()=>{i.current&&(i.current.innerHTML=n,rt(i.current))},[n]),d("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function Lt({el:e}){return d("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function jt({el:e,variables:t,onVariableChange:i}){const[n,o]=E(t?.[e.variable]??"");F(()=>{i?.(e.variable,n)},[n,e.variable,i]);const r=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return d("input",{type:r,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:n,min:e.min,max:e.max,onInput:s=>o(s.target.value)})}function Nt({el:e,variables:t,onVariableChange:i}){const[n,o]=E(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));F(()=>{i?.(e.variable,String(n))},[n,e.variable,i]);const r=e.unit??"",s=(n-e.min)/(e.max-e.min)*100;return d("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-range-value",children:[n,r&&` ${r}`]}),d("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:n,style:`--quiz-range-pct: ${s}%`,onInput:a=>o(Number(a.target.value))}),d("div",{class:"quiz-range-bounds",children:[d("span",{children:[e.min,r&&` ${r}`]}),d("span",{children:[e.max,r&&` ${r}`]})]})]})}function Ot({el:e}){const[t,i]=E(0),n=e.items.length;if(n===0)return null;const o=e.items[t],r=()=>i(a=>(a+1)%n),s=()=>i(a=>(a-1+n)%n);return d("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-testimonial-card",children:[o.avatar&&d("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),d("div",{class:"quiz-testimonial-body",children:[d("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&d("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),d("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),d("div",{class:"quiz-testimonial-text",children:o.text})]})]}),n>1&&d("div",{class:"quiz-testimonial-nav",children:[d("button",{type:"button",class:"quiz-testimonial-prev",onClick:s,"aria-label":"Previous",children:"←"}),d("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(a,c)=>d("button",{type:"button",class:`quiz-testimonial-dot${c===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(c),"aria-label":`Go to testimonial ${c+1}`},c))}),d("button",{type:"button",class:"quiz-testimonial-next",onClick:r,"aria-label":"Next",children:"→"})]})]})}function Ut(e){let t="",i="'Quicksand', system-ui, -apple-system, sans-serif",n="#1A1A1A",o="transparent";if(typeof window<"u"&&typeof document<"u"){const r=getComputedStyle(document.documentElement),s=(c,l)=>r.getPropertyValue(c).trim()||l;i=s("--quiz-font",i),n=s("--quiz-text-primary",n),o=s("--quiz-bg",o),t=["--quiz-bg","--quiz-text-primary","--quiz-text-secondary","--quiz-brand","--quiz-option-bg","--quiz-option-border","--quiz-option-selected-bg","--quiz-option-radius","--quiz-option-padding","--quiz-option-border-width","--quiz-cta-radius","--quiz-cta-padding","--quiz-step-gap","--quiz-font"].map(c=>`  ${c}: ${s(c,"").trim()||"initial"};`).join(`
`)}return`<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap">
<style>
:root {
${t}
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: ${i};
  color: ${n};
  background: ${o};
  -webkit-font-smoothing: antialiased;
}
body { padding: 0; margin: 0; }
</style>
</head>
<body>${e}</body>
</html>`}function Ht(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function Mt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const n of Array.from(e.querySelectorAll(i)))n.parentNode?.removeChild(n);e.innerText.trim().length===0&&(e.style.display="none")}function Bt({el:e,variables:t}){const i=O(null),n=O(null),o=Y(e.html,t),r=Ht(o);if(F(()=>{r||!i.current||(i.current.innerHTML=o,Mt(i.current))},[o,r]),F(()=>{if(!r||!n.current)return;const s=n.current;let a=null,c=0;const l=()=>{try{const u=s.contentDocument;if(!u)return;const h=u.documentElement?.scrollHeight??0;h>0&&(s.style.height=h+"px")}catch{}},f=()=>{l(),c=requestAnimationFrame(l);try{const u=s.contentDocument;u&&typeof ResizeObserver<"u"&&(a=new ResizeObserver(l),a.observe(u.documentElement))}catch{}};return s.addEventListener("load",f),f(),()=>{s.removeEventListener("load",f),a?.disconnect(),c&&cancelAnimationFrame(c)}},[o,r]),r){const s=Ut(o);return d("iframe",{ref:n,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:s,title:`Custom block ${e.id}`})}return d("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function Dt({el:e,onComplete:t,variables:i}){F(()=>{const o=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(o)},[e.seconds,t]);const n=Y(e.text??"",i);return d("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[d("div",{class:"quiz-loading-spinner"}),n&&d("p",{class:"quiz-loading-text",children:n})]})}function Rt({option:e,layout:t,selected:i,onClick:n,variables:o,kindOf:r}){const s=["quiz-option",`quiz-option--${t}`,r==="multi"?"quiz-option--multi":"",i?"quiz-option--selected":""].filter(Boolean).join(" "),a=Y(e.label,o),c=r==="multi"&&(t==="list"||t==="cards"||t==="image_cards"),l=r==="single"&&(t==="list"||t==="cards"||t==="image_cards");return d("button",{class:s,"data-quiz-opt-id":e.id,onClick:n,type:"button",children:[t==="image_cards"&&e.imageUrl&&d("img",{src:e.imageUrl,alt:a,class:"quiz-option-img"}),t==="image_cards"&&!e.imageUrl&&e.imageDescription&&d("span",{class:"quiz-option-img-placeholder",title:e.imageDescription,children:d("span",{class:"quiz-option-img-placeholder-label",children:e.imageDescription})}),e.emoji&&d("span",{class:"quiz-option-emoji",children:e.emoji}),d("span",{class:"quiz-option-label",children:a}),l&&d("span",{class:"quiz-option-arrow","aria-hidden":"true",children:d("svg",{viewBox:"0 0 20 20",width:"16",height:"16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M7 5L13 10L7 15",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"})})}),c&&d("span",{class:`quiz-option-checkbox${i?" quiz-option-checkbox--checked":""}`,"aria-hidden":"true",children:i&&d("svg",{viewBox:"0 0 20 20",width:"14",height:"14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M4 10.5L8 14.5L16 6.5",stroke:"#FFFFFF","stroke-width":"2.5","stroke-linecap":"round","stroke-linejoin":"round"})})})]})}function Gt({el:e,onAnswer:t,market:i,variables:n}){const[o,r]=E(new Set),s=c=>{e.kindOf==="single"?(r(new Set([c])),e.layout!=="dropdown"&&setTimeout(()=>t(e.id,c),200)):r(l=>{const f=new Set(l);return f.has(c)?f.delete(c):f.add(c),f})};if(e.layout==="dropdown")return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:"quiz-question quiz-question--dropdown",children:[d(Vt,{el:e,selected:o,onPick:c=>s(c),market:i}),o.size>0&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>t(e.id,[...o][0]),children:[L("continue",i),e.kindOf==="multi"?` (${o.size})`:""]}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]});const a=e.escapeOption?e.options.filter(c=>c.id!==e.escapeOption.optionId):e.options;return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[a.map(c=>d(Rt,{option:c,layout:e.layout,selected:o.has(c.id),onClick:()=>s(c.id),variables:n,kindOf:e.kindOf},c.id)),(e.kindOf==="multi"||e.kindOf==="single"&&e.escapeOption)&&d("div",{class:"quiz-question-bottom",children:[e.kindOf==="multi"&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",disabled:o.size===0,onClick:()=>{if(o.size===0)return;const c=[...o][0];t(e.id,c)},children:L("continue",i)}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]})]})}function Vt({el:e,selected:t,onPick:i,market:n}){const o=e.kindOf==="multi",r=e.options.filter(z=>t.has(z.id)),s=r.length>0,a=!o&&s?r[0].label:"",[c,l]=E(a),[f,u]=E(!1),h=O(null),p=O(null);F(()=>{const z=I=>{h.current&&!h.current.contains(I.target)&&u(!1)};return document.addEventListener("mousedown",z),()=>document.removeEventListener("mousedown",z)},[]);const y=c.trim().toLowerCase(),_=!o&&s&&r[0].label.toLowerCase()===y,w=y?e.options.filter(z=>z.label.toLowerCase().includes(y)):e.options,b=f&&!_,v=e.dropdownPlaceholder||(e.searchable?L("searchPlaceholder",n):L("selectPlaceholder",n));return d("div",{class:`quiz-dropdown${f?" quiz-dropdown--open":""}${o?" quiz-dropdown--multi":""}`,ref:h,children:[o&&s&&d("div",{class:"quiz-dropdown-chips quiz-dropdown-chips--stack",children:[r.slice(0,4).map(z=>d("span",{class:"quiz-dropdown-chip",children:z.label},z.id)),r.length>4&&d("span",{class:"quiz-dropdown-chip quiz-dropdown-chip--more",children:["+",r.length-4]})]}),d("input",{ref:p,type:"text",class:"quiz-dropdown-input",placeholder:v,value:c,autoComplete:"off",autoCapitalize:"words",spellcheck:!1,onFocus:()=>u(!0),onInput:z=>{l(z.target.value),u(!0)}}),b&&d("ul",{class:"quiz-dropdown-list",children:[w.length===0&&d("li",{class:"quiz-dropdown-empty",children:L("noMatches",n)}),w.slice(0,50).map(z=>{const I=t.has(z.id);return d("li",{children:d("button",{type:"button",class:`quiz-dropdown-item${I?" quiz-dropdown-item--selected":""}`,"data-quiz-opt-id":z.id,onMouseDown:$=>{$.preventDefault()},onClick:()=>{i(z.id),o?(l(""),p.current?.focus()):(l(z.label),u(!1),p.current?.blur())},children:[o&&d("span",{class:`quiz-dropdown-check${I?" quiz-dropdown-check--on":""}`,"aria-hidden":"true",children:I?"✓":""}),z.emoji&&d("span",{class:"quiz-dropdown-emoji",children:z.emoji}),z.label]})},z.id)})]})]})}function Wt({onSubmit:e,market:t}){const[i,n]=E(""),[o,r]=E("");return d("form",{class:"quiz-email-form",onSubmit:a=>{if(a.preventDefault(),!i.includes("@")){r(L("invalidEmail",t));return}r(""),e(i)},novalidate:!0,children:[d("input",{type:"email",class:"quiz-email-input",placeholder:L("emailPlaceholder",t),value:i,onInput:a=>n(a.target.value),required:!0}),o&&d("p",{class:"quiz-email-error",children:o}),d("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:L("continue",t)})]})}function Qt({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:s,variables:a,onVariableChange:c}){const l=e.subEls.some(_=>_.kind==="question"),f=e.subEls.some(_=>_.kind==="loading"),u=!!e.name&&/^commit/i.test(e.name),h=!l&&!f&&!u&&typeof s=="function",p=e.subEls.filter(_=>_.kind==="text_input"),y=h&&p.length>0&&p.some(_=>{const w=a?.[_.variable];return w==null||w.trim().length===0});return d("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(_=>{switch(_.kind){case"title":return d(Ft,{el:_,variables:a},_.id);case"text":return d(At,{el:_,variables:a},_.id);case"image":return d(Lt,{el:_},_.id);case"custom_html":return d(Bt,{el:_,variables:a},_.id);case"loading":return d(Dt,{el:_,onComplete:i,variables:a},_.id);case"question":return d(Gt,{el:_,onAnswer:t,market:r,variables:a},_.id);case"text_input":return d(jt,{el:_,variables:a,onVariableChange:c},_.id);case"range_slider":return d(Nt,{el:_,variables:a,onVariableChange:c},_.id);case"testimonial_slider":return d(Ot,{el:_},_.id)}}),o===e.id&&d(Wt,{onSubmit:n,market:r}),h&&d("div",{class:"quiz-continue-wrap","data-step-name":e.name??"",children:d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:s,disabled:y,children:L("continue",r)})})]})}function Zt({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return d("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:d("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Jt(e){const{brandColors:t,fontSettings:i}=e,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const s=document.createElement("link");s.rel="stylesheet",s.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(s)}const o=e.design??{},r=document.createElement("style");r.textContent=`
:root {
  --quiz-bg: ${t.background};
  --quiz-text-primary: ${t.textPrimary};
  --quiz-text-secondary: ${t.textSecondary};
  --quiz-brand: ${t.primaryBrand};
  --quiz-option-bg: ${t.optionBackground};
  --quiz-option-border: ${t.optionBorder??"rgba(107, 114, 128, 0.3)"};
  --quiz-option-selected-bg: ${t.optionSelectedBg??`color-mix(in srgb, ${t.primaryBrand} 10%, transparent)`};
  --quiz-option-radius: ${o.optionRadius??"16px"};
  --quiz-option-padding: ${o.optionPadding??"16px"};
  --quiz-option-border-width: ${o.optionBorderWidth??"2px"};
  --quiz-cta-radius: ${o.ctaRadius??"12px"};
  --quiz-cta-padding: ${o.ctaPadding??"16px 40px"};
  --quiz-step-gap: ${o.stepGap??"20px"};
  --quiz-font: ${n};
  /* Fallbacks for imported quizzes that reference accent vars inline */
  --red: #d0011b;
  --green: #16a34a;
  --blue: #2563eb;
  --yellow: #eab308;
  --orange: #f97316;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: var(--quiz-font);
  background: var(--quiz-bg);
  color: var(--quiz-text-primary);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
#quiz-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.quiz-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  background: var(--quiz-bg);
}

.quiz-header {
  width: 100%;
  max-width: 720px;
  display: flex;
  align-items: center;
  padding: 14px 20px;
  gap: 12px;
}
/* Equal-flex side containers ensure logo sits in exact center regardless of
 * whether back-btn or step-count are present. Each side reserves the same
 * width so the middle column is mathematically centered. */
.quiz-header-side {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  min-width: 0;
}
.quiz-header-side--end { justify-content: flex-end; }
.quiz-logo { height: 24px; object-fit: contain; flex: 0 0 auto; }

.quiz-back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  color: var(--quiz-text-primary);
  background: rgba(0,0,0,0.04);
  border: none;
  cursor: pointer;
}
.quiz-back-btn:hover { background: rgba(0,0,0,0.08); }

.quiz-step-count {
  font-size: 13px;
  color: var(--quiz-text-secondary);
  margin-left: auto;
}

.quiz-progress {
  width: 100%;
  max-width: 720px;
  height: 4px;
  background: rgba(0,0,0,0.06);
  border-radius: 2px;
  overflow: hidden;
}

.quiz-progress-bar {
  height: 100%;
  background: var(--quiz-brand);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.quiz-content {
  width: 100%;
  max-width: 640px;
  padding: 24px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex: 1;
}

.quiz-step {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: quiz-step-in 0.28s ease-out both;
}
/* Opacity-only animation. Note: a non-none transform on .quiz-step would
 * create a containing block for descendants and break position fixed on the
 * .quiz-question-bottom CTA (per CSS spec). Slide-in was nice-to-have. */
@keyframes quiz-step-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .quiz-step { animation: none; }
}

.quiz-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--quiz-text-primary);
  text-align: center;
  margin-bottom: 4px;
}
.quiz-title h1, .quiz-title h2, .quiz-title h3,
.quiz-title h4, .quiz-title h5, .quiz-title h6 {
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  display: block;
  margin: 0;
  padding: 0;
}

.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
  text-align: center;
}
.quiz-text h1, .quiz-text h2, .quiz-text h3,
.quiz-text h4, .quiz-text h5, .quiz-text h6 {
  color: var(--quiz-text-primary);
  line-height: 1.35;
  letter-spacing: -0.01em;
}
.quiz-text h1, .quiz-text h2 { font-size: 22px; font-weight: 700; }
.quiz-text h3 { font-size: 20px; font-weight: 400; }
.quiz-text h4 { font-size: 18px; font-weight: 400; }
.quiz-text h5 { font-size: 16px; font-weight: 400; }
.quiz-text h6 { font-size: 14px; font-weight: 400; }
.quiz-text p { margin: 0; }
.quiz-text p + p { margin-top: 8px; }

.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 320px; }

.quiz-custom-html { font-size: 15px; line-height: 1.6; color: var(--quiz-text-secondary); }
.quiz-custom-html-frame {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  min-height: 120px;
  /* iframe height is set dynamically by the runtime after load */
}
.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
/* image_cards = PawChamp-style row med thumbnail vänster, label center,
 * checkbox höger. Single-column 100%-bredd så fler alternativ syns utan
 * scroll och layouten matchar resten av multi-frågorna. (William 2026-04-30) */
.quiz-question--image_cards { flex-direction: column; gap: 10px; }
.quiz-question--chips { flex-direction: row; flex-wrap: wrap; gap: 8px; justify-content: flex-start; }

/* Base option: Clarflow-style soft-border card. All brand tokens from
 * settings.brandColors + settings.design so swiped quizzes match source. */
.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: var(--quiz-option-border-width) solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius);
  padding: var(--quiz-option-padding);
  min-height: 52px;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.3;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  width: 100%;
}
.quiz-option:hover { border-color: color-mix(in srgb, var(--quiz-brand) 40%, var(--quiz-option-border)); }
.quiz-option--selected {
  background: var(--quiz-option-selected-bg);
  border-color: var(--quiz-brand);
}
.quiz-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--quiz-bg), 0 0 0 4px var(--quiz-brand);
}

/* raising.dog inspired indicators */
.quiz-option-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1.5px solid var(--quiz-option-border);
  background: #FFFFFF;
  flex: 0 0 auto;
  margin-left: auto;
  transition: background 0.15s, border-color 0.15s;
}
.quiz-option-checkbox--checked {
  background: var(--quiz-brand);
  border-color: var(--quiz-brand);
}
.quiz-option-arrow {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  color: rgba(0, 0, 0, 0.35);
  flex: 0 0 auto;
}
.quiz-option--selected .quiz-option-arrow { color: var(--quiz-brand); }
.quiz-option--cards .quiz-option-arrow { display: none; }
.quiz-option--cards .quiz-option-checkbox { display: none; }

.quiz-option--cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: var(--quiz-option-padding);
}
.quiz-option--image_cards {
  width: 100%;
  flex-direction: row;
  text-align: left;
  padding: 6px 10px;
  overflow: hidden;
  min-height: 0;
  align-items: center;
  gap: 12px;
}
.quiz-option--image_cards .quiz-option-label { padding: 0; font-size: 15px; font-weight: 500; flex: 1; line-height: 1.3; }

.quiz-option--chips {
  width: auto;
  min-height: 0;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  flex: 0 0 auto;
  justify-content: center;
}
.quiz-option--chips .quiz-option-label { flex: 0 0 auto; }
.quiz-option-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 8px; }
.quiz-option-img-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  border: 2px dashed rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: rgba(0,0,0,0.4);
}
.quiz-option--image_cards .quiz-option-img-placeholder { width: 56px; height: 56px; aspect-ratio: 1 / 1; border-radius: 8px; border: 2px dashed rgba(0,0,0,0.15); flex: 0 0 56px; }
.quiz-option-img-placeholder-label {
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
  font-style: italic;
}
.quiz-option--image_cards .quiz-option-img { width: 56px; height: 56px; aspect-ratio: 1 / 1; border-radius: 8px; flex: 0 0 56px; object-fit: contain; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 400; flex: 1; }

.quiz-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 0; }
.quiz-loading-spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(0,0,0,0.08);
  border-top-color: var(--quiz-brand);
  border-radius: 50%;
  animation: quiz-spin 0.8s linear infinite;
}
@keyframes quiz-spin { to { transform: rotate(360deg); } }
.quiz-loading-text { font-size: 16px; color: var(--quiz-text-secondary); }

.quiz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: var(--quiz-cta-padding);
  border-radius: var(--quiz-cta-radius);
  font-size: 18px; font-weight: 700; font-family: var(--quiz-font);
  letter-spacing: 0.2px;
  cursor: pointer; border: none;
  transition: opacity 0.2s, transform 0.2s, background-color 0.2s;
  min-height: 56px;
}
.quiz-btn:hover { opacity: 0.92; }
.quiz-btn:active { transform: scale(0.98); }
.quiz-btn[disabled] {
  background: color-mix(in srgb, var(--quiz-brand) 45%, #FFFFFF) !important;
  color: #FFFFFF !important;
  cursor: not-allowed;
  opacity: 1 !important;
}
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }

/* Fixed-bottom CTA + escape-link wrapper for multi-select questions and
 * single-select with escape (raising.dog / EveryDoggy pattern). Pinned to
 * viewport bottom so the user always sees it regardless of how many options
 * the question has. Padding-bottom on .quiz-content reserves space so the
 * last option isn't hidden under the wrapper. */
.quiz-question-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--quiz-keyboard-inset, 0);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
  transition: bottom 0.18s ease-out;
}
.quiz-question-bottom .quiz-question-continue {
  width: 100%;
  max-width: 680px;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  position: static;
}
.quiz-question-bottom .quiz-escape-link { padding: 8px 16px; }
/* Reserve scrollable space so the fixed wrapper never covers the last option.
 * Applied universally - quiz-step layouts without a fixed bottom only get a
 * little extra breathing room, no UX cost. */
/* Bottom-buffer för fixed CTAs (.quiz-question-bottom OR .quiz-continue-wrap).
 * Nu när alla CTAs är fixed-bottom appliceras 180px alltid. */
.quiz-content { padding-bottom: 180px; }
/* Inline CTA fallback (used by dropdown layout where Continue is rendered
 * inline below the input, not in the fixed wrapper). */
.quiz-question--dropdown .quiz-question-continue {
  position: static;
  margin-top: 24px;
}

/* Escape link rendered under the CTA (raising.dog / EveryDoggy
 * "I don't know my dog's breed" / "None of the above" pattern). Bypasses
 * normal validation - submits with a hidden option-id so analytics still
 * captures the answer. */
.quiz-escape-link {
  display: block;
  margin: 0 auto;
  padding: 12px 16px;
  background: transparent;
  border: none;
  font-family: var(--quiz-font);
  font-size: 14px;
  font-weight: 600;
  color: var(--quiz-brand);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  text-align: center;
}
.quiz-escape-link:hover { opacity: 0.75; }
.quiz-escape-link:focus-visible {
  outline: 2px solid var(--quiz-brand);
  outline-offset: 2px;
  border-radius: 4px;
}

.quiz-email-form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.quiz-email-input {
  width: 100%; padding: 16px 18px;
  border: 1.5px solid rgba(0,0,0,0.15); border-radius: 12px;
  font-size: 16px; font-family: var(--quiz-font);
  background: #fff; color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-email-input:focus { border-color: var(--quiz-brand); border-width: 2px; }
.quiz-email-error { font-size: 13px; color: #dc2626; }

/* Inline Continue (slider/text_input/custom_html): fixed-bottom samma stil
 * som .quiz-question-bottom så CTA-positionen är enhetlig genom hela quizet
 * (William 2026-04-30).
 *
 * bottom-värdet använder --quiz-keyboard-inset (set av App.tsx VisualViewport-
 * listener 2026-05-03) så CTA pushas upp ovanför iOS/Android-tangentbordet på
 * text_input/dropdown-steg. Fallback till 0 när keyboard ej öppen. */
.quiz-continue-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--quiz-keyboard-inset, 0);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
  transition: bottom 0.18s ease-out;
}
.quiz-continue-wrap .quiz-btn--primary {
  width: 100%;
  max-width: 680px;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
/* Steg som ska ha inline-CTA istället för fixed-bottom (William 2026-04-30
 * - profile-card behöver natural flow så CTA inte täcker innehåll). */
.quiz-continue-wrap[data-step-name*="Profil"] {
  position: static;
  background: transparent;
  padding: 24px 0 8px;
}

.quiz-dropdown { position: relative; width: 100%; }
.quiz-dropdown-input {
  width: 100%;
  background: var(--quiz-option-bg);
  border: 2px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  padding: 14px 16px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-dropdown-input::placeholder { color: rgba(0,0,0,0.35); }
.quiz-dropdown-input:focus,
.quiz-dropdown--open .quiz-dropdown-input { border-color: var(--quiz-brand); }
.quiz-dropdown-chips--stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.quiz-dropdown-list {
  list-style: none;
  padding: 4px 0;
  margin: 6px 0 0 0;
  overflow-y: auto;
  max-height: 280px;
  background: #fff;
  border: 1.5px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
.quiz-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 10px 14px;
  font-size: 15px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
}
.quiz-dropdown-item:hover { background: rgba(0,0,0,0.04); }
.quiz-dropdown-item--selected { background: color-mix(in srgb, var(--quiz-brand) 10%, transparent); }
.quiz-dropdown-item--selected:hover { background: color-mix(in srgb, var(--quiz-brand) 14%, transparent); }
.quiz-dropdown-check {
  width: 18px;
  height: 18px;
  border: 1.5px solid rgba(0,0,0,0.2);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: #fff;
  background: #fff;
  flex-shrink: 0;
}
.quiz-dropdown-check--on { background: var(--quiz-brand); border-color: var(--quiz-brand); }
.quiz-dropdown-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.quiz-dropdown-chip {
  font-size: 13px;
  background: color-mix(in srgb, var(--quiz-brand) 12%, transparent);
  color: var(--quiz-text-primary);
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quiz-dropdown-chip--more {
  background: rgba(0,0,0,0.06);
}
.quiz-dropdown-emoji { font-size: 18px; }
.quiz-dropdown-empty {
  padding: 12px 14px;
  font-size: 14px;
  color: var(--quiz-text-secondary);
  font-style: italic;
}

.quiz-text-input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  font-size: 16px;
  font-family: var(--quiz-font);
  background: var(--quiz-option-bg);
  color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-text-input:focus {
  border-color: var(--quiz-brand);
}
.quiz-text-input::placeholder {
  color: rgba(0,0,0,0.35);
}

.quiz-range {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 4px;
}
.quiz-range-value {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  color: var(--quiz-text-primary);
}
.quiz-range-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(
    to right,
    var(--quiz-brand) 0,
    var(--quiz-brand) var(--quiz-range-pct, 50%),
    rgba(0,0,0,0.1) var(--quiz-range-pct, 50%),
    rgba(0,0,0,0.1) 100%
  );
  outline: none;
}
.quiz-range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--quiz-brand);
  border: 3px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
}
.quiz-range-input::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--quiz-brand);
  border: 3px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
  border: none;
}
.quiz-range-bounds {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--quiz-text-secondary);
}

.quiz-testimonial-slider {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quiz-testimonial-card {
  display: flex;
  gap: 14px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 10px;
  padding: 16px;
}
.quiz-testimonial-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.quiz-testimonial-body { flex: 1; min-width: 0; }
.quiz-testimonial-name { font-weight: 600; font-size: 15px; color: var(--quiz-text-primary); margin-bottom: 2px; }
.quiz-testimonial-rating { color: #f59e0b; font-size: 13px; margin-bottom: 4px; letter-spacing: 1px; }
.quiz-testimonial-rating-empty { color: rgba(0,0,0,0.15); }
.quiz-testimonial-text { font-size: 14px; line-height: 1.5; color: var(--quiz-text-secondary); }
.quiz-testimonial-nav { display: flex; align-items: center; justify-content: center; gap: 12px; }
.quiz-testimonial-prev, .quiz-testimonial-next {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--quiz-option-bg);
  border: 1.5px solid rgba(0,0,0,0.15);
  color: var(--quiz-text-primary);
  font-size: 16px;
  cursor: pointer;
}
.quiz-testimonial-dots { display: flex; gap: 6px; }
.quiz-testimonial-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(0,0,0,0.2);
  border: none;
  padding: 0;
  cursor: pointer;
}
.quiz-testimonial-dot--active { background: var(--quiz-brand); transform: scale(1.2); }

.quiz-preview-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  background: rgba(17, 24, 39, 0.94);
  color: #fff;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.4;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  animation: quiz-toast-in 0.2s ease-out;
  z-index: 9999;
}
@keyframes quiz-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* Custom HTML on profile/result screens — strengthen visual hierarchy
   without reintroducing arbitrary imported CSS. Targets common patterns
   from imported quizzes (severity labels, stat rows, divider lines). */
.quiz-custom-html h1, .quiz-custom-html h2, .quiz-custom-html h3 {
  color: var(--quiz-text-primary);
  line-height: 1.3;
  margin: 12px 0 6px;
}
.quiz-custom-html h1 { font-size: 22px; font-weight: 700; }
.quiz-custom-html h2 { font-size: 20px; font-weight: 700; }
.quiz-custom-html h3 { font-size: 17px; font-weight: 600; }
.quiz-custom-html strong, .quiz-custom-html b { color: var(--quiz-text-primary); }
.quiz-custom-html hr {
  border: none;
  border-top: 1px solid rgba(0,0,0,0.08);
  margin: 14px 0;
}
.quiz-custom-html ul, .quiz-custom-html ol {
  padding-left: 20px;
  margin: 8px 0;
}
.quiz-custom-html li { margin-bottom: 4px; }

@media (max-width: 480px) {
  /* Mobile: tight horizontal padding + 180px bottom för fixed CTA. */
  .quiz-content { padding: 20px 10px 180px; }
}
  `,document.head.appendChild(r)}function Kt(e){const t=Object.values(e.nodes).filter(a=>a.kind==="step"),i=new Set(t.map(a=>a.id)),n=Object.values(e.nodes).find(a=>a.kind==="start"),o=[];if(n)for(const a of Object.values(e.edges))a.from===n.id&&i.has(a.to)&&o.push(a.to);else for(const a of t)o.push(a.id);const r=new Set,s=[];for(;o.length;){const a=o.shift();if(r.has(a))continue;r.add(a);const c=e.nodes[a];c&&c.kind==="step"&&s.push(c);for(const l of Object.values(e.edges))l.from===a&&i.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const a of t)r.has(a.id)||s.push(a);return s}function Xt({node:e,onTrigger:t}){const i=O(!1);return F(()=>{i.current||(i.current=!0,t(e))},[e,t]),null}function Z(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function Yt({data:e,settings:t,config:i}){const[n,o]=E(null),[r,s]=E([]),[a,c]=E(null),[l,f]=E({}),[u,h]=E(0),[p,y]=E(null),[_,w]=E({}),b=O(null),v=O(!1);F(()=>{if(!p)return;const m=setTimeout(()=>y(null),4e3);return()=>clearTimeout(m)},[p]),F(()=>{const m=window.visualViewport;if(!m)return;const x=()=>{const g=Math.max(0,window.innerHeight-m.height-m.offsetTop);document.documentElement.style.setProperty("--quiz-keyboard-inset",`${g}px`)};return x(),m.addEventListener("resize",x),m.addEventListener("scroll",x),()=>{m.removeEventListener("resize",x),m.removeEventListener("scroll",x)}},[]);const z=Kt(e),I=z.length;F(()=>{if(v.current)return;v.current=!0;const m=qt(e,i.quizId);f(m);const x=kt(e);if(!x){console.error("[quiz-runtime] No start node found");return}let g=R(e,x.id,null,null,m);try{const q=new URLSearchParams(location.search),P=q.get("goto");if(P&&P.trim()){const Q=P.trim().toLowerCase(),B=Object.values(e.nodes).find(D=>D.kind==="step"&&(D.name??"").toLowerCase().includes(Q));if(B){g=B;const D={name:"Bella",name_pos:"Bellas",gender:"Hane",gender_value:"han",breed:"Golden retriever",primary_pain:"Drar i kopplet",primary_pain_value:"koppeldragning",age:"7-12 mån",time_per_day:"10 min/dag",ignores_owner_value:"Spridd",seeks_affection_value:"Stark"},j=q.get("vars");j&&j.split(",").forEach(te=>{const[Se,Ce]=te.split(":");Se&&Ce&&(D[Se.trim()]=Ce.trim())}),w(D),console.info(`[quiz-runtime] goto=${P} → ${B.id} (${B.kind==="step"?B.name:""})`)}else console.warn(`[quiz-runtime] goto=${P} no match`)}}catch{}if(o(g),!i.preview&&t.providers.metaPixel?.pixelId&&Z("PageView",{}),i.preview)return;const T=St();$t(i.apiBaseUrl,i.quizId,m,T,e.id??"").then(q=>{c(q),b.current=new Ct(q,(P,Q)=>It(i.apiBaseUrl,P,Q)),g&&g.kind==="step"&&b.current.push({event_type:"step_view",step_id:g.id,variant_group_id:g.variantGroupId})}).catch(q=>{console.warn("[quiz-runtime] session start failed:",q)})},[]),F(()=>()=>b.current?.destroy(),[]),F(()=>{const m=x=>{const g=x.data;if(!g||typeof g!="object")return;if(g.type==="quiz-runtime-event"&&typeof g.event_type=="string"){!i.preview&&n&&n.kind==="step"&&(b.current?.push({event_type:g.event_type,step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof g.option_id=="string"?g.option_id:void 0,meta:g.meta&&typeof g.meta=="object"?g.meta:void 0}),t.providers.metaPixel?.pixelId&&typeof g.option_id=="string"&&g.option_id.endsWith("_yes")&&Z("Lead",{content_name:t.metadata.title,content_category:"commit_gate"}));return}if(g.type!=="quiz-runtime-continue"||!n||n.kind!=="step")return;i.preview||b.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof g.value=="string"?g.value:"yes",meta:{source:"commit_gate_modal"}});const T=R(e,n.id,null,null,l);T&&$(T)};return window.addEventListener("message",m),()=>window.removeEventListener("message",m)},[n,e,l,i.preview,t]),F(()=>{if(!n||n.kind!=="step")return;const m=n;if(m.subEls.length===0){const x=R(e,m.id,null,null,l);x&&x.id!==n.id&&$(x,!1)}},[n]);const $=H((m,x=!0)=>{if(x&&n&&s(g=>[...g,n]),o(m),m.kind==="step"){const g=z.findIndex(T=>T.id===m.id);g>=0&&h(g),i.preview||(b.current?.push({event_type:"step_view",step_id:m.id,variant_group_id:m.variantGroupId}),t.providers.metaPixel?.pixelId&&m.kind==="step"&&(m.name??"").toLowerCase().includes("offer")&&Z("InitiateCheckout",{content_name:t.metadata.title,content_category:"offer_page"}))}},[n,z,i.preview,t]),ee=H((m,x)=>{if(!n||n.kind!=="step")return;const g=n.subEls.find(q=>q.id===m&&q.kind==="question");if(g&&g.kind==="question"&&g.variable){const q=g.options.find(P=>P.id===x);q&&w(P=>({...P,[g.variable]:q.label,...q.value!==void 0?{[`${g.variable}_value`]:q.value}:{}}))}i.preview||b.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:x,meta:{questionElId:m}});const T=R(e,n.id,x,m,l);T&&$(T)},[n,e,l,$]),G=H((m,x)=>{w(g=>({...g,[m]:x}))},[]),W=H(()=>{if(!n||n.kind!=="step")return;const m=R(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),A=H(()=>{if(!n||n.kind!=="step")return;const m=R(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),U=H(async m=>{if(!i.preview&&(b.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:m}}),t.providers.metaPixel?.pixelId&&Z("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&a))try{await Pt(i.apiBaseUrl,a,m,t.providers.klaviyo.listId)}catch(x){console.warn("[quiz-runtime] Klaviyo subscribe failed:",x)}if(n&&n.kind==="step"){const x=R(e,n.id,null,null,l);x&&$(x)}},[n,e,l,$,a,t,i]),ot=H(()=>{i.preview||b.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),s(m=>{if(m.length===0)return m;const x=m[m.length-1],g=m.slice(0,-1);if(o(x),x.kind==="step"){const T=z.findIndex(q=>q.id===x.id);T>=0&&h(T)}return g})},[n,z]),at=H(m=>{if(i.preview){const j=m.redirectUrl||t.redirectUrl||"(no redirect URL)";y(`[Preview] Would redirect to: ${j}`);return}b.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&Z("CompleteRegistration",{content_name:t.metadata.title,value:0});const x=m.redirectUrl||t.redirectUrl||"",g=new URL(x,location.href),T=/^\/cart\/\d+:\d+/i.test(g.pathname),q=(j,te)=>{T?g.searchParams.set(`attributes[${j}]`,te):g.searchParams.set(j,te)};q("utm_source","quiz"),q("utm_medium","funnel"),q("utm_campaign",i.quizSlug||"quiz"),a&&q("utm_content",a);const P=_.primary_pain_value||_.primary_pain;P&&q("utm_term",P),a&&q("qz_sid",a),P&&q("qz_pain",P),_.breed&&q("qz_breed",_.breed),_.time_per_day&&q("qz_time",_.time_per_day),_.age&&q("qz_age",_.age);const Q=g.toString(),B=b.current?.flush().catch(()=>{})??Promise.resolve(),D=new Promise(j=>setTimeout(j,1500));Promise.race([B,D]).finally(()=>{location.href=Q})},[t,a,i.preview,i.quizSlug,_]);if(n?.kind==="exit")return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-content quiz-exit",children:[d(Xt,{node:n,onTrigger:at}),d("div",{class:"quiz-loading-spinner"}),d("p",{class:"quiz-text",children:L("loadingResults",i.market)})]}),p&&d("div",{class:"quiz-preview-toast",children:p})]});if(!n||n.kind!=="step")return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content",children:d("div",{class:"quiz-loading",children:d("div",{class:"quiz-loading-spinner"})})})});const ke=n,st=t.backNavigation&&r.length>0,ut=t.providers.klaviyo?.captureAtStepId;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-header",children:[d("div",{class:"quiz-header-side quiz-header-side--start",children:st&&d("button",{class:"quiz-back-btn",type:"button",onClick:ot,"aria-label":"Go back",children:"←"})}),t.brandLogo?.enabled&&t.brandLogo.url&&d("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),d("div",{class:"quiz-header-side quiz-header-side--end",children:t.stepProgressCount&&d("span",{class:"quiz-step-count",children:[u+1," / ",I]})})]}),t.progressBar&&d(Zt,{current:u+1,total:I}),d("div",{class:"quiz-content",children:d(Qt,{node:ke,onAnswer:ee,onLoadingComplete:W,onEmailSubmit:U,captureAtStepId:ut,market:i.market,onContinue:A,variables:_,onVariableChange:G},ke.id)})]})}function De(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Jt(t);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}ht(d(Yt,{data:e,settings:t,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",De):De();
