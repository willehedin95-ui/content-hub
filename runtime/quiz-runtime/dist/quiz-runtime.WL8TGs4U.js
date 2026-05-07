var pe,w,We,W,Ee,Ve,Qe,_e,re,Y,Ze,xe,ve,be,ue={},de=[],mt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,fe=Array.isArray;function D(e,t){for(var i in t)e[i]=t[i];return e}function ye(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function _t(e,t,i){var n,o,r,a={};for(r in t)r=="key"?n=t[r]:r=="ref"?o=t[r]:a[r]=t[r];if(arguments.length>2&&(a.children=arguments.length>3?pe.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(r in e.defaultProps)a[r]===void 0&&(a[r]=e.defaultProps[r]);return ae(e,a,n,o,null)}function ae(e,t,i,n,o){var r={type:e,props:t,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++We,__i:-1,__u:0};return o==null&&w.vnode!=null&&w.vnode(r),r}function ie(e){return e.children}function se(e,t){this.props=e,this.context=t}function Z(e,t){if(t==null)return e.__?Z(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?Z(e):null}function ht(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,n=[],o=[],r=D({},t);r.__v=t.__v+1,w.vnode&&w.vnode(r),we(e.__P,r,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,n,i??Z(t),!!(32&t.__u),o),r.__v=t.__v,r.__.__k[r.__i]=r,Ye(n,r,o),t.__e=t.__=null,r.__e!=i&&Ke(r)}}function Ke(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Ke(e)}function Te(e){(!e.__d&&(e.__d=!0)&&W.push(e)&&!ce.__r++||Ee!=w.debounceRendering)&&((Ee=w.debounceRendering)||Ve)(ce)}function ce(){try{for(var e,t=1;W.length;)W.length>t&&W.sort(Qe),e=W.shift(),t=W.length,ht(e)}finally{W.length=ce.__r=0}}function Je(e,t,i,n,o,r,a,s,l,d,f){var u,m,p,q,g,k,b,x=n&&n.__k||de,v=t.length;for(l=gt(i,t,x,l,v),u=0;u<v;u++)(p=i.__k[u])!=null&&(m=p.__i!=-1&&x[p.__i]||ue,p.__i=u,k=we(e,p,m,o,r,a,s,l,d,f),q=p.__e,p.ref&&m.ref!=p.ref&&(m.ref&&ke(m.ref,null,p),f.push(p.ref,p.__c||q,p)),g==null&&q!=null&&(g=q),(b=!!(4&p.__u))||m.__k===p.__k?(l=Xe(p,l,e,b),b&&m.__e&&(m.__e=null)):typeof p.type=="function"&&k!==void 0?l=k:q&&(l=q.nextSibling),p.__u&=-7);return i.__e=g,l}function gt(e,t,i,n,o){var r,a,s,l,d,f=i.length,u=f,m=0;for(e.__k=new Array(o),r=0;r<o;r++)(a=t[r])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[r]=ae(null,a,null,null,null):fe(a)?a=e.__k[r]=ae(ie,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[r]=ae(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[r]=a,l=r+m,a.__=e,a.__b=e.__b+1,s=null,(d=a.__i=vt(a,i,l,u))!=-1&&(u--,(s=i[d])&&(s.__u|=2)),s==null||s.__v==null?(d==-1&&(o>f?m--:o<f&&m++),typeof a.type!="function"&&(a.__u|=4)):d!=l&&(d==l-1?m--:d==l+1?m++:(d>l?m--:m++,a.__u|=4))):e.__k[r]=null;if(u)for(r=0;r<f;r++)(s=i[r])!=null&&(2&s.__u)==0&&(s.__e==n&&(n=Z(s)),tt(s,s));return n}function Xe(e,t,i,n){var o,r;if(typeof e.type=="function"){for(o=e.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=e,t=Xe(o[r],t,i,n));return t}e.__e!=t&&(n&&(t&&e.type&&!t.parentNode&&(t=Z(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function vt(e,t,i,n){var o,r,a,s=e.key,l=e.type,d=t[i],f=d!=null&&(2&d.__u)==0;if(d===null&&s==null||f&&s==d.key&&l==d.type)return i;if(n>(f?1:0)){for(o=i-1,r=i+1;o>=0||r<t.length;)if((d=t[a=o>=0?o--:r++])!=null&&(2&d.__u)==0&&s==d.key&&l==d.type)return a}return-1}function Pe(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||mt.test(t)?i:i+"px"}function oe(e,t,i,n,o){var r,a;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof n=="string"&&(e.style.cssText=n=""),n)for(t in n)i&&t in i||Pe(e.style,t,"");if(i)for(t in i)n&&i[t]==n[t]||Pe(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")r=t!=(t=t.replace(Ze,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+r]=i,i?n?i[Y]=n[Y]:(i[Y]=xe,e.addEventListener(t,r?be:ve,r)):e.removeEventListener(t,r?be:ve,r);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function Fe(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[re]==null)t[re]=xe++;else if(t[re]<i[Y])return;return i(w.event?w.event(t):t)}}}function we(e,t,i,n,o,r,a,s,l,d){var f,u,m,p,q,g,k,b,x,v,T,L,K,A,J,j=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(l=!!(32&i.__u),r=[s=t.__e=i.__e]),(f=w.__b)&&f(t);e:if(typeof j=="function")try{if(b=t.props,x=j.prototype&&j.prototype.render,v=(f=j.contextType)&&n[f.__c],T=f?v?v.props.value:f.__:n,i.__c?k=(u=t.__c=i.__c).__=u.__E:(x?t.__c=u=new j(b,T):(t.__c=u=new se(b,T),u.constructor=j,u.render=zt),v&&v.sub(u),u.state||(u.state={}),u.__n=n,m=u.__d=!0,u.__h=[],u._sb=[]),x&&u.__s==null&&(u.__s=u.state),x&&j.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=D({},u.__s)),D(u.__s,j.getDerivedStateFromProps(b,u.__s))),p=u.props,q=u.state,u.__v=t,m)x&&j.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),x&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(x&&j.getDerivedStateFromProps==null&&b!==p&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(b,T),t.__v==i.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(b,u.__s,T)===!1){t.__v!=i.__v&&(u.props=b,u.state=u.__s,u.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(R){R&&(R.__=t)}),de.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&a.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(b,u.__s,T),x&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(p,q,g)})}if(u.context=T,u.props=b,u.__P=e,u.__e=!1,L=w.__r,K=0,x)u.state=u.__s,u.__d=!1,L&&L(t),f=u.render(u.props,u.state,u.context),de.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,L&&L(t),f=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++K<25);u.state=u.__s,u.getChildContext!=null&&(n=D(D({},n),u.getChildContext())),x&&!m&&u.getSnapshotBeforeUpdate!=null&&(g=u.getSnapshotBeforeUpdate(p,q)),A=f!=null&&f.type===ie&&f.key==null?et(f.props.children):f,s=Je(e,fe(A)?A:[A],t,i,n,o,r,a,s,l,d),u.base=t.__e,t.__u&=-161,u.__h.length&&a.push(u),k&&(u.__E=u.__=null)}catch(R){if(t.__v=null,l||r!=null)if(R.then){for(t.__u|=l?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,t.__e=s}else{for(J=r.length;J--;)ye(r[J]);ze(t)}else t.__e=i.__e,t.__k=i.__k,R.then||ze(t);w.__e(R,t,i)}else r==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):s=t.__e=bt(i.__e,t,i,n,o,r,a,l,d);return(f=w.diffed)&&f(t),128&t.__u?void 0:s}function ze(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(ze))}function Ye(e,t,i){for(var n=0;n<i.length;n++)ke(i[n],i[++n],i[++n]);w.__c&&w.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(r){r.call(o)})}catch(r){w.__e(r,o.__v)}})}function et(e){return typeof e!="object"||e==null||e.__b>0?e:fe(e)?e.map(et):D({},e)}function bt(e,t,i,n,o,r,a,s,l){var d,f,u,m,p,q,g,k=i.props||ue,b=t.props,x=t.type;if(x=="svg"?o="http://www.w3.org/2000/svg":x=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(d=0;d<r.length;d++)if((p=r[d])&&"setAttribute"in p==!!x&&(x?p.localName==x:p.nodeType==3)){e=p,r[d]=null;break}}if(e==null){if(x==null)return document.createTextNode(b);e=document.createElementNS(o,x,b.is&&b),s&&(w.__m&&w.__m(t,r),s=!1),r=null}if(x==null)k===b||s&&e.data==b||(e.data=b);else{if(r=r&&pe.call(e.childNodes),!s&&r!=null)for(k={},d=0;d<e.attributes.length;d++)k[(p=e.attributes[d]).name]=p.value;for(d in k)p=k[d],d=="dangerouslySetInnerHTML"?u=p:d=="children"||d in b||d=="value"&&"defaultValue"in b||d=="checked"&&"defaultChecked"in b||oe(e,d,null,p,o);for(d in b)p=b[d],d=="children"?m=p:d=="dangerouslySetInnerHTML"?f=p:d=="value"?q=p:d=="checked"?g=p:s&&typeof p!="function"||k[d]===p||oe(e,d,p,k[d],o);if(f)s||u&&(f.__html==u.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(u&&(e.innerHTML=""),Je(t.type=="template"?e.content:e,fe(m)?m:[m],t,i,n,x=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,a,r?r[0]:i.__k&&Z(i,0),s,l),r!=null)for(d=r.length;d--;)ye(r[d]);s||(d="value",x=="progress"&&q==null?e.removeAttribute("value"):q!=null&&(q!==e[d]||x=="progress"&&!q||x=="option"&&q!=k[d])&&oe(e,d,q,k[d],o),d="checked",g!=null&&g!=e[d]&&oe(e,d,g,k[d],o))}return e}function ke(e,t,i){try{if(typeof e=="function"){var n=typeof e.__u=="function";n&&e.__u(),n&&t==null||(e.__u=e(t))}else e.current=t}catch(o){w.__e(o,i)}}function tt(e,t,i){var n,o;if(w.unmount&&w.unmount(e),(n=e.ref)&&(n.current&&n.current!=e.__e||ke(n,null,t)),(n=e.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){w.__e(r,t)}n.base=n.__P=null}if(n=e.__k)for(o=0;o<n.length;o++)n[o]&&tt(n[o],t,i||typeof e.type!="function");i||ye(e.__e),e.__c=e.__=e.__e=void 0}function zt(e,t,i){return this.constructor(e,i)}function qt(e,t,i){var n,o,r,a;t==document&&(t=document.documentElement),w.__&&w.__(e,t),o=(n=!1)?null:t.__k,r=[],a=[],we(t,e=t.__k=_t(ie,null,[e]),o||ue,ue,t.namespaceURI,o?null:t.firstChild?pe.call(t.childNodes):null,r,o?o.__e:t.firstChild,n,a),Ye(r,e,a)}pe=de.slice,w={__e:function(e,t,i,n){for(var o,r,a;t=t.__;)if((o=t.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(e)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,n||{}),a=o.__d),a)return o.__E=o}catch(s){e=s}throw e}},We=0,se.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=D({},this.state),typeof e=="function"&&(e=e(D({},i),this.props)),e&&D(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),Te(this))},se.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Te(this))},se.prototype.render=ie,W=[],Ve=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Qe=function(e,t){return e.__v.__b-t.__v.__b},ce.__r=0,_e=Math.random().toString(8),re="__d"+_e,Y="__a"+_e,Ze=/(PointerCapture)$|Capture$/i,xe=0,ve=Fe(!1),be=Fe(!0);var xt=0;function c(e,t,i,n,o,r){t||(t={});var a,s,l=t;if("ref"in l)for(s in l={},t)s=="ref"?a=t[s]:l[s]=t[s];var d={type:e,props:l,key:i,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--xt,__i:-1,__u:0,__source:o,__self:r};if(typeof e=="function"&&(a=e.defaultProps))for(s in a)l[s]===void 0&&(l[s]=a[s]);return w.vnode&&w.vnode(d),d}var ee,C,he,Ae,te=0,it=[],I=w,Le=I.__b,Oe=I.__r,je=I.diffed,Ne=I.__c,Be=I.unmount,Ue=I.__;function Se(e,t){I.__h&&I.__h(C,e,te||t),te=0;var i=C.__H||(C.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function E(e){return te=1,yt(rt,e)}function yt(e,t,i){var n=Se(ee++,2);if(n.t=e,!n.__c&&(n.__=[rt(void 0,t),function(s){var l=n.__N?n.__N[0]:n.__[0],d=n.t(l,s);l!==d&&(n.__N=[d,n.__[1]],n.__c.setState({}))}],n.__c=C,!C.__f)){var o=function(s,l,d){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(m){return m.__c});if(f.every(function(m){return!m.__N}))return!r||r.call(this,s,l,d);var u=n.__c.props!==s;return f.some(function(m){if(m.__N){var p=m.__[0];m.__=m.__N,m.__N=void 0,p!==m.__[0]&&(u=!0)}}),r&&r.call(this,s,l,d)||u};C.__f=!0;var r=C.shouldComponentUpdate,a=C.componentWillUpdate;C.componentWillUpdate=function(s,l,d){if(this.__e){var f=r;r=void 0,o(s,l,d),r=f}a&&a.call(this,s,l,d)},C.shouldComponentUpdate=o}return n.__N||n.__}function F(e,t){var i=Se(ee++,3);!I.__s&&ot(i.__H,t)&&(i.__=e,i.u=t,C.__H.__h.push(i))}function H(e){return te=5,nt(function(){return{current:e}},[])}function nt(e,t){var i=Se(ee++,7);return ot(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function G(e,t){return te=8,nt(function(){return e},t)}function wt(){for(var e;e=it.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(le),t.__h.some(qe),t.__h=[]}catch(i){t.__h=[],I.__e(i,e.__v)}}}I.__b=function(e){C=null,Le&&Le(e)},I.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Ue&&Ue(e,t)},I.__r=function(e){Oe&&Oe(e),ee=0;var t=(C=e.__c).__H;t&&(he===C?(t.__h=[],C.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(le),t.__h.some(qe),t.__h=[],ee=0)),he=C},I.diffed=function(e){je&&je(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(it.push(t)!==1&&Ae===I.requestAnimationFrame||((Ae=I.requestAnimationFrame)||kt)(wt)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),he=C=null},I.__c=function(e,t){t.some(function(i){try{i.__h.some(le),i.__h=i.__h.filter(function(n){return!n.__||qe(n)})}catch(n){t.some(function(o){o.__h&&(o.__h=[])}),t=[],I.__e(n,i.__v)}}),Ne&&Ne(e,t)},I.unmount=function(e){Be&&Be(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(n){try{le(n)}catch(o){t=o}}),i.__H=void 0,t&&I.__e(t,i.__v))};var Me=typeof requestAnimationFrame=="function";function kt(e){var t,i=function(){clearTimeout(n),Me&&cancelAnimationFrame(t),setTimeout(e)},n=setTimeout(i,35);Me&&(t=requestAnimationFrame(i))}function le(e){var t=C,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),C=t}function qe(e){var t=C;e.__c=e.__(),C=t}function ot(e,t){return!e||e.length!==t.length||t.some(function(i,n){return i!==e[n]})}function rt(e,t){return typeof t=="function"?t(e):t}function St(e){const t=e.reduce((n,o)=>n+(o.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const n of e)if(i-=n.trafficPct??0,i<=0)return n;return e[e.length-1]}function Ct(e,t){const i={};for(const o of Object.values(e.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const a=`quiz_${t}_vg_${o}`,s=localStorage.getItem(a);if(s&&e.nodes[s])n[o]=s;else{const l=St(r);localStorage.setItem(a,l.id),n[o]=l.id}}return n}function It(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function $t(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function V(e,t,i,n,o){const r=It(e,t);if(r.length===0)return null;if(i!==null){const s=r.find(l=>$t(l.condition,i,n));if(s)return De(e,s.to,o)}const a=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return De(e,a.to,o)}function De(e,t,i){const n=e.nodes[t];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return e.nodes[o]??n}return n}function Et(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function Tt(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=e.get(n);o&&(t[n]=o)}return t}class Pt{constructor(t,i,n){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.apiEventsUrl=`${n}/api/quiz/events`,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flushBeacon()}),window.addEventListener("pagehide",()=>this.flushBeacon())}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}flushBeacon(){if(this.buf.length===0)return;const t=this.buf.splice(0),i=JSON.stringify({session_id:this.sessionId,events:t.map(o=>({event_type:o.event_type,step_id:o.step_id,variant_group_id:o.variant_group_id,option_id:o.option_id,meta:o.meta}))});let n=!1;try{if(typeof navigator<"u"&&typeof navigator.sendBeacon=="function"){const o=new Blob([i],{type:"application/json"});n=navigator.sendBeacon(this.apiEventsUrl,o)}}catch{n=!1}if(!n)try{fetch(this.apiEventsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0})}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function Ft(e,t,i,n,o){const r=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function At(e,t,i){const n={session_id:t,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function Lt(e,t,i,n){const o=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const Ot={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},loadingCheckout:{se:"Tar dig till kassan...",dk:"Tager dig til kassen...",no:"Tar deg til kassen...",en:"Taking you to checkout..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function B(e,t){const i=t??"en",n=Ot[e];return i in n?n[i]:n.en}function at(e){if(!e)return;const t=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))t(o)};for(const i of Array.from(e.children))t(i)}function ge(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function jt(e){if(!e)return e;const t=e.slice(-1).toLowerCase();return t==="s"||t==="x"||t==="z"?e:e+"s"}const He={name:"Din valp",breed:"din valp",primary_pain:"beteendeproblem",primary_pain_value:"beteendet",problem_duration:"ett tag",upcoming_event_value:"",time_per_day:"10 min/dag"};function Re(e,t){if(t!=null&&t.trim()!=="")return t;if(e in He)return He[e]}function ne(e,t){return e.includes("{")?e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{if(n.endsWith("_pos")){const a=n.slice(0,-4),s=t?.[a],l=Re(a,s);return l==null?i:ge(l==="Din valp"?"Din valps":jt(l))}const o=t?.[n],r=Re(n,o);return r==null?i:ge(r)}):e}function Nt({el:e,variables:t}){const i=H(null),n=ne(e.text,t);return F(()=>{i.current&&(i.current.innerHTML=n,at(i.current))},[n]),c("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function Bt({el:e,variables:t}){const i=H(null),n=ne(e.text,t);return F(()=>{i.current&&(i.current.innerHTML=n,at(i.current))},[n]),c("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function Ut({el:e}){return c("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function Mt({el:e,variables:t,onVariableChange:i}){const[n,o]=E(t?.[e.variable]??"");F(()=>{i?.(e.variable,n)},[n,e.variable,i]);const r=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return c("input",{type:r,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:n,min:e.min,max:e.max,onInput:a=>o(a.target.value)})}function Dt({el:e,variables:t,onVariableChange:i}){const[n,o]=E(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));F(()=>{i?.(e.variable,String(n))},[n,e.variable,i]);const r=e.unit??"",a=(n-e.min)/(e.max-e.min)*100;return c("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-range-value",children:[n,r&&` ${r}`]}),c("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:n,style:`--quiz-range-pct: ${a}%`,onInput:s=>o(Number(s.target.value))}),c("div",{class:"quiz-range-bounds",children:[c("span",{children:[e.min,r&&` ${r}`]}),c("span",{children:[e.max,r&&` ${r}`]})]})]})}function Ht({el:e}){const[t,i]=E(0),n=e.items.length;if(n===0)return null;const o=e.items[t],r=()=>i(s=>(s+1)%n),a=()=>i(s=>(s-1+n)%n);return c("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-testimonial-card",children:[o.avatar&&c("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),c("div",{class:"quiz-testimonial-body",children:[c("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&c("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),c("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),c("div",{class:"quiz-testimonial-text",children:o.text})]})]}),n>1&&c("div",{class:"quiz-testimonial-nav",children:[c("button",{type:"button",class:"quiz-testimonial-prev",onClick:a,"aria-label":"Previous",children:"←"}),c("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(s,l)=>c("button",{type:"button",class:`quiz-testimonial-dot${l===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(l),"aria-label":`Go to testimonial ${l+1}`},l))}),c("button",{type:"button",class:"quiz-testimonial-next",onClick:r,"aria-label":"Next",children:"→"})]})]})}function Rt(e){let t="",i="'Quicksand', system-ui, -apple-system, sans-serif",n="#1A1A1A",o="transparent";if(typeof window<"u"&&typeof document<"u"){const r=getComputedStyle(document.documentElement),a=(l,d)=>r.getPropertyValue(l).trim()||d;i=a("--quiz-font",i),n=a("--quiz-text-primary",n),o=a("--quiz-bg",o),t=["--quiz-bg","--quiz-text-primary","--quiz-text-secondary","--quiz-brand","--quiz-option-bg","--quiz-option-border","--quiz-option-selected-bg","--quiz-option-radius","--quiz-option-padding","--quiz-option-border-width","--quiz-cta-radius","--quiz-cta-padding","--quiz-step-gap","--quiz-font"].map(l=>`  ${l}: ${a(l,"").trim()||"initial"};`).join(`
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
</html>`}function Gt(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function Wt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const n of Array.from(e.querySelectorAll(i)))n.parentNode?.removeChild(n);e.innerText.trim().length===0&&(e.style.display="none")}function Vt({el:e,variables:t}){const i=H(null),n=H(null),o=ne(e.html,t),r=Gt(o);if(F(()=>{r||!i.current||(i.current.innerHTML=o,Wt(i.current))},[o,r]),F(()=>{if(!r||!n.current)return;const a=n.current;let s=null,l=0;const d=[],f=()=>{try{const m=a.contentDocument;if(!m)return;const p=m.documentElement,q=m.body,g=Math.max(p?.scrollHeight??0,p?.offsetHeight??0,q?.scrollHeight??0,q?.offsetHeight??0);g>0&&(a.style.height=g+"px")}catch{}},u=()=>{f(),l=requestAnimationFrame(f);try{const m=a.contentDocument;if(!m)return;typeof ResizeObserver<"u"&&(s=new ResizeObserver(f),s.observe(m.documentElement),m.body&&s.observe(m.body));for(const p of Array.from(m.images)){if(p.complete)continue;const q=()=>f();p.addEventListener("load",q),p.addEventListener("error",q),d.push({img:p,handler:q})}}catch{}};return a.addEventListener("load",u),u(),()=>{a.removeEventListener("load",u),s?.disconnect();for(const{img:m,handler:p}of d)m.removeEventListener("load",p),m.removeEventListener("error",p);l&&cancelAnimationFrame(l)}},[o,r]),r){const a=Rt(o);return c("iframe",{ref:n,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:a,scrolling:"no",title:`Custom block ${e.id}`})}return c("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function Qt({el:e,onComplete:t,variables:i}){F(()=>{const o=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(o)},[e.seconds,t]);const n=ne(e.text??"",i);return c("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[c("div",{class:"quiz-loading-spinner"}),n&&c("p",{class:"quiz-loading-text",children:n})]})}function Zt({option:e,layout:t,selected:i,onClick:n,variables:o,kindOf:r}){const a=["quiz-option",`quiz-option--${t}`,r==="multi"?"quiz-option--multi":"",i?"quiz-option--selected":""].filter(Boolean).join(" "),s=ne(e.label,o),l=r==="multi"&&(t==="list"||t==="cards"||t==="image_cards"),d=r==="single"&&(t==="list"||t==="cards"||t==="image_cards");return c("button",{class:a,"data-quiz-opt-id":e.id,"data-quiz-opt-value":e.value,onClick:n,type:"button",children:[t==="image_cards"&&e.imageUrl&&c("img",{src:e.imageUrl,alt:s,class:"quiz-option-img"}),t==="image_cards"&&!e.imageUrl&&e.imageDescription&&c("span",{class:"quiz-option-img-placeholder",title:e.imageDescription,children:c("span",{class:"quiz-option-img-placeholder-label",children:e.imageDescription})}),t==="image_cards"?c("span",{class:"quiz-option-row",children:[e.emoji&&c("span",{class:"quiz-option-emoji",children:e.emoji}),c("span",{class:"quiz-option-label",children:s})]}):c(ie,{children:[e.emoji&&c("span",{class:"quiz-option-emoji",children:e.emoji}),c("span",{class:"quiz-option-label",children:s})]}),d&&c("span",{class:"quiz-option-arrow","aria-hidden":"true",children:c("svg",{viewBox:"0 0 20 20",width:"16",height:"16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:c("path",{d:"M7 5L13 10L7 15",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"})})}),l&&c("span",{class:`quiz-option-checkbox${i?" quiz-option-checkbox--checked":""}`,"aria-hidden":"true",children:i&&c("svg",{viewBox:"0 0 20 20",width:"14",height:"14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:c("path",{d:"M4 10.5L8 14.5L16 6.5",stroke:"#FFFFFF","stroke-width":"2.5","stroke-linecap":"round","stroke-linejoin":"round"})})})]})}function Kt({el:e,onAnswer:t,market:i,variables:n}){const[o,r]=E(new Set),a=l=>{e.kindOf==="single"?(r(new Set([l])),e.layout!=="dropdown"&&setTimeout(()=>t(e.id,l),200)):r(d=>{const f=new Set(d);return f.has(l)?f.delete(l):f.add(l),f})};if(e.layout==="dropdown")return c("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:"quiz-question quiz-question--dropdown",children:[c(Jt,{el:e,selected:o,onPick:l=>a(l),market:i}),o.size>0&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>t(e.id,[...o][0]),children:[B("continue",i),e.kindOf==="multi"?` (${o.size})`:""]}),e.escapeOption&&c("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]});const s=e.escapeOption?e.options.filter(l=>l.id!==e.escapeOption.optionId):e.options;return c("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[s.map(l=>c(Zt,{option:l,layout:e.layout,selected:o.has(l.id),onClick:()=>a(l.id),variables:n,kindOf:e.kindOf},l.id)),(e.kindOf==="multi"||e.kindOf==="single"&&e.escapeOption)&&c("div",{class:"quiz-question-bottom",children:[e.kindOf==="multi"&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",disabled:o.size===0,onClick:()=>{if(o.size===0)return;const l=[...o][0];t(e.id,l)},children:B("continue",i)}),e.escapeOption&&c("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]})]})}function Jt({el:e,selected:t,onPick:i,market:n}){const o=e.kindOf==="multi",r=e.options.filter(v=>t.has(v.id)),a=r.length>0,s=!o&&a?r[0].label:"",[l,d]=E(s),[f,u]=E(!1),m=H(null),p=H(null);F(()=>{const v=T=>{m.current&&!m.current.contains(T.target)&&u(!1)};return document.addEventListener("mousedown",v),()=>document.removeEventListener("mousedown",v)},[]);const q=l.trim().toLowerCase(),g=!o&&a&&r[0].label.toLowerCase()===q,k=q?e.options.filter(v=>v.label.toLowerCase().includes(q)):e.options,b=f&&!g,x=e.dropdownPlaceholder||(e.searchable?B("searchPlaceholder",n):B("selectPlaceholder",n));return c("div",{class:`quiz-dropdown${f?" quiz-dropdown--open":""}${o?" quiz-dropdown--multi":""}`,ref:m,children:[o&&a&&c("div",{class:"quiz-dropdown-chips quiz-dropdown-chips--stack",children:[r.slice(0,4).map(v=>c("span",{class:"quiz-dropdown-chip",children:v.label},v.id)),r.length>4&&c("span",{class:"quiz-dropdown-chip quiz-dropdown-chip--more",children:["+",r.length-4]})]}),c("input",{ref:p,type:"text",class:"quiz-dropdown-input",placeholder:x,value:l,autoComplete:"off",autoCapitalize:"words",spellcheck:!1,onFocus:()=>u(!0),onInput:v=>{d(v.target.value),u(!0)}}),b&&c("ul",{class:"quiz-dropdown-list",children:[k.length===0&&c("li",{class:"quiz-dropdown-empty",children:B("noMatches",n)}),k.slice(0,50).map(v=>{const T=t.has(v.id);return c("li",{children:c("button",{type:"button",class:`quiz-dropdown-item${T?" quiz-dropdown-item--selected":""}`,"data-quiz-opt-id":v.id,onMouseDown:L=>{L.preventDefault()},onClick:()=>{i(v.id),o?(d(""),p.current?.focus()):(d(v.label),u(!1),p.current?.blur())},children:[o&&c("span",{class:`quiz-dropdown-check${T?" quiz-dropdown-check--on":""}`,"aria-hidden":"true",children:T?"✓":""}),v.emoji&&c("span",{class:"quiz-dropdown-emoji",children:v.emoji}),v.label]})},v.id)})]})]})}function Xt({onSubmit:e,market:t}){const[i,n]=E(""),[o,r]=E("");return c("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!i.includes("@")){r(B("invalidEmail",t));return}r(""),e(i)},novalidate:!0,children:[c("input",{type:"email",class:"quiz-email-input",placeholder:B("emailPlaceholder",t),value:i,onInput:s=>n(s.target.value),required:!0}),o&&c("p",{class:"quiz-email-error",children:o}),c("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:B("continue",t)})]})}function Yt(){const t="quiz-offer-timer-end",[i,n]=E(600);F(()=>{let a;try{const d=sessionStorage.getItem(t);d?a=parseInt(d,10):(a=Date.now()+600*1e3,sessionStorage.setItem(t,String(a)))}catch{a=Date.now()+600*1e3}const s=()=>{const d=Math.max(0,Math.floor((a-Date.now())/1e3));n(d)};s();const l=setInterval(s,1e3);return()=>clearInterval(l)},[]);const o=String(Math.floor(i/60)).padStart(2,"0"),r=String(i%60).padStart(2,"0");return c("div",{class:"quiz-offer-timer",children:[c("span",{class:"quiz-offer-timer-text",children:"Personligt erbjudande löper ut"}),c("span",{class:"quiz-offer-timer-clock",children:[o,":",r]})]})}function ei({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:a,variables:s,onVariableChange:l}){const d=e.subEls.some(g=>g.kind==="question"),f=e.subEls.some(g=>g.kind==="loading"),u=!!e.name&&/^commit/i.test(e.name),m=!d&&!f&&!u&&typeof a=="function",p=e.subEls.filter(g=>g.kind==="text_input"),q=m&&p.length>0&&p.some(g=>{const k=s?.[g.variable];return k==null||k.trim().length===0});return c("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(g=>{switch(g.kind){case"title":return c(Nt,{el:g,variables:s},g.id);case"text":return c(Bt,{el:g,variables:s},g.id);case"image":return c(Ut,{el:g},g.id);case"custom_html":return c(Vt,{el:g,variables:s},g.id);case"loading":return c(Qt,{el:g,onComplete:i,variables:s},g.id);case"question":return c(Kt,{el:g,onAnswer:t,market:r,variables:s},g.id);case"text_input":return c(Mt,{el:g,variables:s,onVariableChange:l},g.id);case"range_slider":return c(Dt,{el:g,variables:s,onVariableChange:l},g.id);case"testimonial_slider":return c(Ht,{el:g},g.id)}}),o===e.id&&c(Xt,{onSubmit:n,market:r}),m&&c("div",{class:"quiz-continue-wrap","data-step-name":e.name??"",children:c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,disabled:q,children:B("continue",r)})})]})}function ti({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return c("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:c("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function ii(e){const{brandColors:t,fontSettings:i}=e,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const a=document.createElement("link");a.rel="stylesheet",a.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(a)}const o=e.design??{},r=document.createElement("style");r.textContent=`
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
  /* iframe height is set dynamically by the runtime after load.
   * overflow:hidden + scrolling=no på elementet förhindrar nested scroll
   * om height-mätningen är minimal undershoot (William 2026-05-03 - testimonial-
   * sliden visade dubbel scrollbar pga avatar-images laddades efter initial
   * scrollHeight-mätning). Page scrollar normalt outside iframe. */
  overflow: hidden;
}

/* När iframens commit-gate öppnar modal, expandera iframen till full
 * viewport så iframens egna lokala overlay täcker hela skärmen (inte bara
 * iframens normala area). Iframes är "windows" som content inuti inte kan
 * visuellt escape från - därför kan parent-backdrop aldrig hamna BAKOM
 * iframen och samtidigt ha modal-content från iframen ovanpå. Lösning:
 * gör iframen själv viewport-stor (William 2026-05-04).
 *
 * App.tsx togglar .modal-active på .quiz-shell baserat på postMessage
 * från iframen ('quiz-modal-open'/'quiz-modal-close'). */
.quiz-shell.modal-active .quiz-custom-html-frame {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 100;
  animation: quiz-modal-in 0.2s ease-out;
}
.quiz-shell.modal-active {
  /* Lås body-scroll när modal är aktiv så användaren inte kan rulla ifrån
   * fokuset och hitta gamla iframe-positionen. */
  overflow: hidden;
}
@keyframes quiz-modal-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Offer timer-bar för profil+offer-steget (b24). Renderas mellan profile-
 * card och offer-body sub-els i StepRenderer (inte i parent App.tsx) så
 * den hamnar visuellt EFTER profile-card och blir sticky när användaren
 * scrollar förbi - inte fixed-from-top. Edge-to-edge via 100vw + negative
 * margin för att bryta ut ur .quiz-content's horizontal padding. (William
 * 2026-05-04). */
.quiz-offer-timer {
  position: sticky;
  top: 0;
  z-index: 30;
  width: 100vw;
  margin-left: calc((100vw - 100%) / -2);
  margin-right: calc((100vw - 100%) / -2);
  margin-top: 24px;
  margin-bottom: 16px;
  background: linear-gradient(90deg, #FF7A45 0%, #FF9D6E 100%);
  color: #FFFFFF;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 6px 20px rgba(255, 122, 69, 0.25);
}
.quiz-offer-timer-text {
  font-size: 14px;
  font-weight: 700;
}
.quiz-offer-timer-clock {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: rgba(255, 255, 255, 0.18);
  padding: 4px 12px;
  border-radius: 8px;
}

.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
/* image_cards = Woofz-style grid med stor bild ovanför label. 2-kol när
 * få options, wrap vid fler. Bild dominerar visuellt - perfekt för
 * gender/age-segmentering där visuell distinktion mellan alternativ
 * gör scanningen snabbare. (William 2026-05-07) */
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
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
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 10px 8px 8px;
  overflow: hidden;
  min-height: 0;
  align-items: center;
  gap: 6px;
}
.quiz-option--image_cards .quiz-option-label { padding: 0; font-size: 15px; font-weight: 500; line-height: 1.3; text-align: center; }
/* Hide arrow on image_cards (Woofz-style: image dominates, no chevron chrome). */
.quiz-option--image_cards .quiz-option-arrow { display: none; }
/* Emoji + label render inline as one row under the image: "♂ Hane" */
.quiz-option--image_cards .quiz-option-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.quiz-option--image_cards .quiz-option-emoji { font-size: 16px; line-height: 1; }

/* Subtle gender tint on image_cards (Doginwork). Only applies when option.value
 * is "han"/"hon" - other quizzes using image_cards keep the default brand bg. */
.quiz-option--image_cards[data-quiz-opt-value="han"] {
  background: #E8F0F9;
}
.quiz-option--image_cards[data-quiz-opt-value="hon"] {
  background: #F8E8EC;
}
.quiz-option--image_cards[data-quiz-opt-value="han"]:hover {
  background: #DCE8F5;
}
.quiz-option--image_cards[data-quiz-opt-value="hon"]:hover {
  background: #F5DCE3;
}

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
.quiz-option--image_cards .quiz-option-img-placeholder { width: 100%; max-width: 140px; aspect-ratio: 1 / 1; border-radius: 12px; border: 2px dashed rgba(0,0,0,0.15); flex: 0 0 auto; margin: 0 auto; }
.quiz-option-img-placeholder-label {
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
  font-style: italic;
}
.quiz-option--image_cards .quiz-option-img { width: 100%; max-width: 110px; height: auto; aspect-ratio: 1 / 1; border-radius: 12px; flex: 0 0 auto; object-fit: contain; margin: 0 auto; }
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

/* Profil-steget (b24) + Offer-steget (boffer) ska ha edge-to-edge content -
 * profile-card-heron är full-bleed (puppy graduation image), och offer-
 * timer-bannern på offer-steget ska gå hela vägen ut. Ta bort .quiz-content's
 * horizontal + top padding så iframen blir full viewport-bredd. (William
 * 2026-05-04 v3 - splittade tillbaka från merged) */
.quiz-shell.profil-step .quiz-content,
.quiz-shell.offer-step .quiz-content {
  padding: 0 0 64px;
  gap: 0;
}

/* Offer-step: göm runtime's auto-Continue button. Sidan har inline CTA-
 * knappar (.v20-cta) som postMessar continue själva. (William 2026-05-04 v3) */
.quiz-shell.offer-step .quiz-continue-wrap { display: none; }
.quiz-shell.offer-step .quiz-content { padding-bottom: 32px; }
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
 * - profile-card behöver natural flow så CTA inte täcker innehåll).
 *
 * 2026-05-03: Utökad till educational interstitials (Pattern Reveal,
 * Competitive destruction, Puppy blues) - sticky CTA gjorde att användare
 * skippade slidens content innan de läst. Inline CTA tvingar scroll =
 * tvingar konsumption, per quiz-knowledge "loading screen captive attention"-
 * principen applicerad på högvärdiga insight panels. */
.quiz-continue-wrap[data-step-name*="Profil"],
.quiz-continue-wrap[data-step-name*="Pattern Reveal"],
.quiz-continue-wrap[data-step-name*="Competitive destruction"],
.quiz-continue-wrap[data-step-name*="Puppy blues"] {
  position: static;
  background: transparent;
  padding: 24px 16px 8px;
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
  `,document.head.appendChild(r)}function ni(e){const t=Object.values(e.nodes).filter(l=>l.kind==="step"),i=new Set(t.map(l=>l.id)),n=new Map;for(const l of t){if(!l.variantGroupId)continue;const d=n.get(l.variantGroupId)??[];d.push(l),n.set(l.variantGroupId,d)}const o=Object.values(e.nodes).find(l=>l.kind==="start"),r=[];if(o)for(const l of Object.values(e.edges))l.from===o.id&&i.has(l.to)&&r.push(l.to);else for(const l of t)r.push(l.id);const a=new Set,s=[];for(;r.length;){const l=r.shift();if(a.has(l))continue;a.add(l);const d=e.nodes[l];if(d&&d.kind==="step"&&(s.push(d),d.variantGroupId)){const f=n.get(d.variantGroupId)??[];for(let u=f.length-1;u>=0;u--){const m=f[u];m.id!==l&&!a.has(m.id)&&r.unshift(m.id)}}for(const f of Object.values(e.edges))f.from===l&&i.has(f.to)&&!a.has(f.to)&&r.push(f.to)}for(const l of t)a.has(l.id)||s.push(l);return s}function oi({node:e,onTrigger:t}){const i=H(!1);return F(()=>{i.current||(i.current=!0,t(e))},[e,t]),null}function X(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function ri({data:e,settings:t,config:i}){const[n,o]=E(null),[r,a]=E([]),[s,l]=E(null),[d,f]=E({}),[u,m]=E(0),[p,q]=E(null),[g,k]=E(!1),[b,x]=E({}),v=H(null),T=H(!1);F(()=>{if(!p)return;const _=setTimeout(()=>q(null),4e3);return()=>clearTimeout(_)},[p]),F(()=>{const _=window.visualViewport;if(!_)return;const z=()=>{const h=Math.max(0,window.innerHeight-_.height-_.offsetTop);document.documentElement.style.setProperty("--quiz-keyboard-inset",`${h}px`)};return z(),_.addEventListener("resize",z),_.addEventListener("scroll",z),()=>{_.removeEventListener("resize",z),_.removeEventListener("scroll",z)}},[]);const L=ni(e),K=L.length;F(()=>{if(T.current)return;T.current=!0;try{const S=new URLSearchParams(location.search).get("variant");if(S){const U={};for(const P of Object.values(e.nodes))P.kind!=="step"||!P.variantGroupId||(U[P.variantGroupId]||(U[P.variantGroupId]=[]),U[P.variantGroupId].push(P.id));const N=S.toUpperCase();for(const[P,O]of Object.entries(U)){let M=null;N==="A"||N==="0"?M=O[0]:N==="B"||N==="1"?M=O[1]??O[0]:e.nodes[S]&&(M=S),M&&localStorage.setItem(`quiz_${i.quizId}_vg_${P}`,M)}}}catch{}const _=Ct(e,i.quizId);f(_);const z=Et(e);if(!z){console.error("[quiz-runtime] No start node found");return}let h=V(e,z.id,null,null,_);try{const y=new URLSearchParams(location.search),S=y.get("goto");if(S&&S.trim()){const U=S.trim().toLowerCase(),N=Object.values(e.nodes).find(P=>P.kind==="step"&&(P.name??"").toLowerCase().includes(U));if(N){h=N;const P={name:"Bella",name_pos:"Bellas",gender:"Hane",gender_value:"han",breed:"Golden retriever",primary_pain:"Drar i kopplet",primary_pain_value:"koppeldragning",age:"7-12 mån",time_per_day:"10 min/dag",ignores_owner_value:"Spridd",seeks_affection_value:"Stark"},O=y.get("vars");O&&O.split(",").forEach(M=>{const[Ie,$e]=M.split(":");Ie&&$e&&(P[Ie.trim()]=$e.trim())}),x(P),console.info(`[quiz-runtime] goto=${S} → ${N.id} (${N.kind==="step"?N.name:""})`)}else console.warn(`[quiz-runtime] goto=${S} no match`)}}catch{}if(o(h),!i.preview&&t.providers.metaPixel?.pixelId&&X("PageView",{}),i.preview)return;const $=Tt();Ft(i.apiBaseUrl,i.quizId,_,$,e.id??"").then(y=>{l(y),v.current=new Pt(y,(S,U)=>At(i.apiBaseUrl,S,U),i.apiBaseUrl),h&&h.kind==="step"&&(v.current.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId}),v.current.flush())}).catch(y=>{console.warn("[quiz-runtime] session start failed:",y)})},[]),F(()=>()=>v.current?.destroy(),[]),F(()=>{const _=z=>{const h=z.data;if(!h||typeof h!="object")return;if(h.type==="quiz-modal-open"){k(!0);return}if(h.type==="quiz-modal-close"){k(!1);return}if(h.type==="quiz-runtime-event"&&typeof h.event_type=="string"){!i.preview&&n&&n.kind==="step"&&(v.current?.push({event_type:h.event_type,step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof h.option_id=="string"?h.option_id:void 0,meta:h.meta&&typeof h.meta=="object"?h.meta:void 0}),t.providers.metaPixel?.pixelId&&typeof h.option_id=="string"&&h.option_id.endsWith("_yes")&&X("Lead",{content_name:t.metadata.title,content_category:"commit_gate"}));return}if(h.type!=="quiz-runtime-continue"||!n||n.kind!=="step")return;i.preview||v.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof h.value=="string"?h.value:"yes",meta:{source:"commit_gate_modal"}});const $=V(e,n.id,null,null,d);$&&A($)};return window.addEventListener("message",_),()=>window.removeEventListener("message",_)},[n,e,d,i.preview,t]),F(()=>{if(!n||n.kind!=="step")return;const _=n;if(_.subEls.length===0){const z=V(e,_.id,null,null,d);z&&z.id!==n.id&&A(z,!1)}},[n]);const A=G((_,z=!0)=>{if(z&&n&&a(h=>[...h,n]),o(_),_.kind==="step"){const h=L.findIndex($=>$.id===_.id);h>=0&&m(h),i.preview||(v.current?.push({event_type:"step_view",step_id:_.id,variant_group_id:_.variantGroupId}),t.providers.metaPixel?.pixelId&&_.kind==="step"&&(_.name??"").toLowerCase().includes("offer")&&X("InitiateCheckout",{content_name:t.metadata.title,content_category:"offer_page"}))}},[n,L,i.preview,t]),J=G((_,z)=>{if(!n||n.kind!=="step")return;const h=n.subEls.find(y=>y.id===_&&y.kind==="question");if(h&&h.kind==="question"&&h.variable){const y=h.options.find(S=>S.id===z);y&&x(S=>({...S,[h.variable]:y.label,...y.value!==void 0?{[`${h.variable}_value`]:y.value}:{}}))}i.preview||v.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:z,meta:{questionElId:_}});const $=V(e,n.id,z,_,d);$&&A($)},[n,e,d,A]),j=G((_,z)=>{x(h=>({...h,[_]:z}))},[]),R=G(()=>{if(!n||n.kind!=="step")return;const _=V(e,n.id,null,null,d);_&&A(_)},[n,e,d,A]),st=G(()=>{if(!n||n.kind!=="step")return;const _=V(e,n.id,null,null,d);_&&A(_)},[n,e,d,A]),lt=G(async _=>{if(!i.preview&&(v.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:_}}),t.providers.metaPixel?.pixelId&&X("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&s))try{await Lt(i.apiBaseUrl,s,_,t.providers.klaviyo.listId)}catch(z){console.warn("[quiz-runtime] Klaviyo subscribe failed:",z)}if(n&&n.kind==="step"){const z=V(e,n.id,null,null,d);z&&A(z)}},[n,e,d,A,s,t,i]),ut=G(()=>{i.preview||v.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),a(_=>{if(_.length===0)return _;const z=_[_.length-1],h=_.slice(0,-1);if(o(z),z.kind==="step"){const $=L.findIndex(y=>y.id===z.id);$>=0&&m($)}return h})},[n,L]),dt=G(_=>{if(i.preview){const O=_.redirectUrl||t.redirectUrl||"(no redirect URL)";q(`[Preview] Would redirect to: ${O}`);return}v.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&X("CompleteRegistration",{content_name:t.metadata.title,value:0});const z=_.redirectUrl||t.redirectUrl||"",h=new URL(z,location.href),$=/^\/cart\/\d+:\d+/i.test(h.pathname),y=(O,M)=>{$?h.searchParams.set(`attributes[${O}]`,M):h.searchParams.set(O,M)};y("utm_source","quiz"),y("utm_medium","funnel"),y("utm_campaign",i.quizSlug||"quiz"),s&&y("utm_content",s);const S=b.primary_pain_value||b.primary_pain;S&&y("utm_term",S),s&&y("qz_sid",s),S&&y("qz_pain",S),b.breed&&y("qz_breed",b.breed),b.time_per_day&&y("qz_time",b.time_per_day),b.age&&y("qz_age",b.age);const U=h.toString(),N=v.current?.flush().catch(()=>{})??Promise.resolve(),P=new Promise(O=>setTimeout(O,1500));Promise.race([N,P]).finally(()=>{location.href=U})},[t,s,i.preview,i.quizSlug,b]);if(n?.kind==="exit"){const _=n,z=_.redirectUrl||t.redirectUrl||"";let h=!1;try{const y=new URL(z,location.href);h=/^\/cart\/\d+:\d+/i.test(y.pathname)}catch{}const $=B(h?"loadingCheckout":"loadingResults",i.market);return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-content quiz-exit",children:[c(oi,{node:_,onTrigger:dt}),c("div",{class:"quiz-loading-spinner"}),c("p",{class:"quiz-text",children:$})]}),p&&c("div",{class:"quiz-preview-toast",children:p})]})}if(!n||n.kind!=="step")return c("div",{class:"quiz-shell",children:c("div",{class:"quiz-content",children:c("div",{class:"quiz-loading",children:c("div",{class:"quiz-loading-spinner"})})})});const Q=n,ct=t.backNavigation&&r.length>0,pt=t.providers.klaviyo?.captureAtStepId,Ce=!!Q.name&&/Block 24 - Profil/i.test(Q.name),me=!!Q.name&&/^Offer page/i.test(Q.name),ft=["quiz-shell",g&&"modal-active",Ce&&"profil-step",me&&"offer-step"].filter(Boolean).join(" ");return c("div",{class:ft,children:[c("div",{class:"quiz-header",children:[c("div",{class:"quiz-header-side quiz-header-side--start",children:ct&&c("button",{class:"quiz-back-btn",type:"button",onClick:ut,"aria-label":"Go back",children:"←"})}),t.brandLogo?.enabled&&t.brandLogo.url&&c("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),c("div",{class:"quiz-header-side quiz-header-side--end",children:t.stepProgressCount&&c("span",{class:"quiz-step-count",children:[u+1," / ",K]})})]}),t.progressBar&&!Ce&&!me&&c(ti,{current:u+1,total:K}),me&&c(Yt,{}),c("div",{class:"quiz-content",children:c(ei,{node:Q,onAnswer:J,onLoadingComplete:R,onEmailSubmit:lt,captureAtStepId:pt,market:i.market,onContinue:st,variables:b,onVariableChange:j},Q.id)})]})}function Ge(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}ii(t);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}qt(c(ri,{data:e,settings:t,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Ge):Ge();
