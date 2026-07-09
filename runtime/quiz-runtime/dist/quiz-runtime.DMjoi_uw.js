var _e,w,Xe,W,Ae,Ye,et,ve,le,te,tt,ke,xe,qe,pe={},fe=[],wt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,he=Array.isArray;function R(e,t){for(var i in t)e[i]=t[i];return e}function Se(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function kt(e,t,i){var r,o,n,a={};for(n in t)n=="key"?r=t[n]:n=="ref"?o=t[n]:a[n]=t[n];if(arguments.length>2&&(a.children=arguments.length>3?_e.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(n in e.defaultProps)a[n]===void 0&&(a[n]=e.defaultProps[n]);return ue(e,a,r,o,null)}function ue(e,t,i,r,o){var n={type:e,props:t,key:i,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Xe,__i:-1,__u:0};return o==null&&w.vnode!=null&&w.vnode(n),n}function re(e){return e.children}function de(e,t){this.props=e,this.context=t}function X(e,t){if(t==null)return e.__?X(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?X(e):null}function St(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,r=[],o=[],n=R({},t);n.__v=t.__v+1,w.vnode&&w.vnode(n),Ie(e.__P,n,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,r,i??X(t),!!(32&t.__u),o),n.__v=t.__v,n.__.__k[n.__i]=n,ot(r,n,o),t.__e=t.__=null,n.__e!=i&&it(n)}}function it(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),it(e)}function Oe(e){(!e.__d&&(e.__d=!0)&&W.push(e)&&!me.__r++||Ae!=w.debounceRendering)&&((Ae=w.debounceRendering)||Ye)(me)}function me(){try{for(var e,t=1;W.length;)W.length>t&&W.sort(et),e=W.shift(),t=W.length,St(e)}finally{W.length=me.__r=0}}function nt(e,t,i,r,o,n,a,u,l,d,p){var s,f,m,z,h,k,y,q=r&&r.__k||fe,g=t.length;for(l=It(i,t,q,l,g),s=0;s<g;s++)(m=i.__k[s])!=null&&(f=m.__i!=-1&&q[m.__i]||pe,m.__i=s,k=Ie(e,m,f,o,n,a,u,l,d,p),z=m.__e,m.ref&&f.ref!=m.ref&&(f.ref&&Ce(f.ref,null,m),p.push(m.ref,m.__c||z,m)),h==null&&z!=null&&(h=z),(y=!!(4&m.__u))||f.__k===m.__k?(l=rt(m,l,e,y),y&&f.__e&&(f.__e=null)):typeof m.type=="function"&&k!==void 0?l=k:z&&(l=z.nextSibling),m.__u&=-7);return i.__e=h,l}function It(e,t,i,r,o){var n,a,u,l,d,p=i.length,s=p,f=0;for(e.__k=new Array(o),n=0;n<o;n++)(a=t[n])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[n]=ue(null,a,null,null,null):he(a)?a=e.__k[n]=ue(re,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[n]=ue(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[n]=a,l=n+f,a.__=e,a.__b=e.__b+1,u=null,(d=a.__i=Ct(a,i,l,s))!=-1&&(s--,(u=i[d])&&(u.__u|=2)),u==null||u.__v==null?(d==-1&&(o>p?f--:o<p&&f++),typeof a.type!="function"&&(a.__u|=4)):d!=l&&(d==l-1?f--:d==l+1?f++:(d>l?f--:f++,a.__u|=4))):e.__k[n]=null;if(s)for(n=0;n<p;n++)(u=i[n])!=null&&(2&u.__u)==0&&(u.__e==r&&(r=X(u)),st(u,u));return r}function rt(e,t,i,r){var o,n;if(typeof e.type=="function"){for(o=e.__k,n=0;o&&n<o.length;n++)o[n]&&(o[n].__=e,t=rt(o[n],t,i,r));return t}e.__e!=t&&(r&&(t&&e.type&&!t.parentNode&&(t=X(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function Ct(e,t,i,r){var o,n,a,u=e.key,l=e.type,d=t[i],p=d!=null&&(2&d.__u)==0;if(d===null&&u==null||p&&u==d.key&&l==d.type)return i;if(r>(p?1:0)){for(o=i-1,n=i+1;o>=0||n<t.length;)if((d=t[a=o>=0?o--:n++])!=null&&(2&d.__u)==0&&u==d.key&&l==d.type)return a}return-1}function je(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||wt.test(t)?i:i+"px"}function ae(e,t,i,r,o){var n,a;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof r=="string"&&(e.style.cssText=r=""),r)for(t in r)i&&t in i||je(e.style,t,"");if(i)for(t in i)r&&i[t]==r[t]||je(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")n=t!=(t=t.replace(tt,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+n]=i,i?r?i[te]=r[te]:(i[te]=ke,e.addEventListener(t,n?qe:xe,n)):e.removeEventListener(t,n?qe:xe,n);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function Ne(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[le]==null)t[le]=ke++;else if(t[le]<i[te])return;return i(w.event?w.event(t):t)}}}function Ie(e,t,i,r,o,n,a,u,l,d){var p,s,f,m,z,h,k,y,q,g,P,S,J,V,Q,j=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(l=!!(32&i.__u),n=[u=t.__e=i.__e]),(p=w.__b)&&p(t);e:if(typeof j=="function")try{if(y=t.props,q=j.prototype&&j.prototype.render,g=(p=j.contextType)&&r[p.__c],P=p?g?g.props.value:p.__:r,i.__c?k=(s=t.__c=i.__c).__=s.__E:(q?t.__c=s=new j(y,P):(t.__c=s=new de(y,P),s.constructor=j,s.render=Et),g&&g.sub(s),s.state||(s.state={}),s.__n=r,f=s.__d=!0,s.__h=[],s._sb=[]),q&&s.__s==null&&(s.__s=s.state),q&&j.getDerivedStateFromProps!=null&&(s.__s==s.state&&(s.__s=R({},s.__s)),R(s.__s,j.getDerivedStateFromProps(y,s.__s))),m=s.props,z=s.state,s.__v=t,f)q&&j.getDerivedStateFromProps==null&&s.componentWillMount!=null&&s.componentWillMount(),q&&s.componentDidMount!=null&&s.__h.push(s.componentDidMount);else{if(q&&j.getDerivedStateFromProps==null&&y!==m&&s.componentWillReceiveProps!=null&&s.componentWillReceiveProps(y,P),t.__v==i.__v||!s.__e&&s.shouldComponentUpdate!=null&&s.shouldComponentUpdate(y,s.__s,P)===!1){t.__v!=i.__v&&(s.props=y,s.state=s.__s,s.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(D){D&&(D.__=t)}),fe.push.apply(s.__h,s._sb),s._sb=[],s.__h.length&&a.push(s);break e}s.componentWillUpdate!=null&&s.componentWillUpdate(y,s.__s,P),q&&s.componentDidUpdate!=null&&s.__h.push(function(){s.componentDidUpdate(m,z,h)})}if(s.context=P,s.props=y,s.__P=e,s.__e=!1,S=w.__r,J=0,q)s.state=s.__s,s.__d=!1,S&&S(t),p=s.render(s.props,s.state,s.context),fe.push.apply(s.__h,s._sb),s._sb=[];else do s.__d=!1,S&&S(t),p=s.render(s.props,s.state,s.context),s.state=s.__s;while(s.__d&&++J<25);s.state=s.__s,s.getChildContext!=null&&(r=R(R({},r),s.getChildContext())),q&&!f&&s.getSnapshotBeforeUpdate!=null&&(h=s.getSnapshotBeforeUpdate(m,z)),V=p!=null&&p.type===re&&p.key==null?at(p.props.children):p,u=nt(e,he(V)?V:[V],t,i,r,o,n,a,u,l,d),s.base=t.__e,t.__u&=-161,s.__h.length&&a.push(s),k&&(s.__E=s.__=null)}catch(D){if(t.__v=null,l||n!=null)if(D.then){for(t.__u|=l?160:128;u&&u.nodeType==8&&u.nextSibling;)u=u.nextSibling;n[n.indexOf(u)]=null,t.__e=u}else{for(Q=n.length;Q--;)Se(n[Q]);ye(t)}else t.__e=i.__e,t.__k=i.__k,D.then||ye(t);w.__e(D,t,i)}else n==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):u=t.__e=$t(i.__e,t,i,r,o,n,a,l,d);return(p=w.diffed)&&p(t),128&t.__u?void 0:u}function ye(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(ye))}function ot(e,t,i){for(var r=0;r<i.length;r++)Ce(i[r],i[++r],i[++r]);w.__c&&w.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(n){n.call(o)})}catch(n){w.__e(n,o.__v)}})}function at(e){return typeof e!="object"||e==null||e.__b>0?e:he(e)?e.map(at):R({},e)}function $t(e,t,i,r,o,n,a,u,l){var d,p,s,f,m,z,h,k=i.props||pe,y=t.props,q=t.type;if(q=="svg"?o="http://www.w3.org/2000/svg":q=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),n!=null){for(d=0;d<n.length;d++)if((m=n[d])&&"setAttribute"in m==!!q&&(q?m.localName==q:m.nodeType==3)){e=m,n[d]=null;break}}if(e==null){if(q==null)return document.createTextNode(y);e=document.createElementNS(o,q,y.is&&y),u&&(w.__m&&w.__m(t,n),u=!1),n=null}if(q==null)k===y||u&&e.data==y||(e.data=y);else{if(n=n&&_e.call(e.childNodes),!u&&n!=null)for(k={},d=0;d<e.attributes.length;d++)k[(m=e.attributes[d]).name]=m.value;for(d in k)m=k[d],d=="dangerouslySetInnerHTML"?s=m:d=="children"||d in y||d=="value"&&"defaultValue"in y||d=="checked"&&"defaultChecked"in y||ae(e,d,null,m,o);for(d in y)m=y[d],d=="children"?f=m:d=="dangerouslySetInnerHTML"?p=m:d=="value"?z=m:d=="checked"?h=m:u&&typeof m!="function"||k[d]===m||ae(e,d,m,k[d],o);if(p)u||s&&(p.__html==s.__html||p.__html==e.innerHTML)||(e.innerHTML=p.__html),t.__k=[];else if(s&&(e.innerHTML=""),nt(t.type=="template"?e.content:e,he(f)?f:[f],t,i,r,q=="foreignObject"?"http://www.w3.org/1999/xhtml":o,n,a,n?n[0]:i.__k&&X(i,0),u,l),n!=null)for(d=n.length;d--;)Se(n[d]);u||(d="value",q=="progress"&&z==null?e.removeAttribute("value"):z!=null&&(z!==e[d]||q=="progress"&&!z||q=="option"&&z!=k[d])&&ae(e,d,z,k[d],o),d="checked",h!=null&&h!=e[d]&&ae(e,d,h,k[d],o))}return e}function Ce(e,t,i){try{if(typeof e=="function"){var r=typeof e.__u=="function";r&&e.__u(),r&&t==null||(e.__u=e(t))}else e.current=t}catch(o){w.__e(o,i)}}function st(e,t,i){var r,o;if(w.unmount&&w.unmount(e),(r=e.ref)&&(r.current&&r.current!=e.__e||Ce(r,null,t)),(r=e.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(n){w.__e(n,t)}r.base=r.__P=null}if(r=e.__k)for(o=0;o<r.length;o++)r[o]&&st(r[o],t,i||typeof e.type!="function");i||Se(e.__e),e.__c=e.__=e.__e=void 0}function Et(e,t,i){return this.constructor(e,i)}function Tt(e,t,i){var r,o,n,a;t==document&&(t=document.documentElement),w.__&&w.__(e,t),o=(r=!1)?null:t.__k,n=[],a=[],Ie(t,e=t.__k=kt(re,null,[e]),o||pe,pe,t.namespaceURI,o?null:t.firstChild?_e.call(t.childNodes):null,n,o?o.__e:t.firstChild,r,a),ot(n,e,a)}_e=fe.slice,w={__e:function(e,t,i,r){for(var o,n,a;t=t.__;)if((o=t.__c)&&!o.__)try{if((n=o.constructor)&&n.getDerivedStateFromError!=null&&(o.setState(n.getDerivedStateFromError(e)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,r||{}),a=o.__d),a)return o.__E=o}catch(u){e=u}throw e}},Xe=0,de.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=R({},this.state),typeof e=="function"&&(e=e(R({},i),this.props)),e&&R(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),Oe(this))},de.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Oe(this))},de.prototype.render=re,W=[],Ye=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,et=function(e,t){return e.__v.__b-t.__v.__b},me.__r=0,ve=Math.random().toString(8),le="__d"+ve,te="__a"+ve,tt=/(PointerCapture)$|Capture$/i,ke=0,xe=Ne(!1),qe=Ne(!0);var Pt=0;function c(e,t,i,r,o,n){t||(t={});var a,u,l=t;if("ref"in l)for(u in l={},t)u=="ref"?a=t[u]:l[u]=t[u];var d={type:e,props:l,key:i,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--Pt,__i:-1,__u:0,__source:o,__self:n};if(typeof e=="function"&&(a=e.defaultProps))for(u in a)l[u]===void 0&&(l[u]=a[u]);return w.vnode&&w.vnode(d),d}var ie,I,be,Be,ne=0,lt=[],E=w,Ue=E.__b,Me=E.__r,De=E.diffed,He=E.__c,Re=E.unmount,Ge=E.__;function $e(e,t){E.__h&&E.__h(I,e,ne||t),ne=0;var i=I.__H||(I.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function F(e){return ne=1,Lt(ct,e)}function Lt(e,t,i){var r=$e(ie++,2);if(r.t=e,!r.__c&&(r.__=[ct(void 0,t),function(u){var l=r.__N?r.__N[0]:r.__[0],d=r.t(l,u);l!==d&&(r.__N=[d,r.__[1]],r.__c.setState({}))}],r.__c=I,!I.__f)){var o=function(u,l,d){if(!r.__c.__H)return!0;var p=r.__c.__H.__.filter(function(f){return f.__c});if(p.every(function(f){return!f.__N}))return!n||n.call(this,u,l,d);var s=r.__c.props!==u;return p.some(function(f){if(f.__N){var m=f.__[0];f.__=f.__N,f.__N=void 0,m!==f.__[0]&&(s=!0)}}),n&&n.call(this,u,l,d)||s};I.__f=!0;var n=I.shouldComponentUpdate,a=I.componentWillUpdate;I.componentWillUpdate=function(u,l,d){if(this.__e){var p=n;n=void 0,o(u,l,d),n=p}a&&a.call(this,u,l,d)},I.shouldComponentUpdate=o}return r.__N||r.__}function A(e,t){var i=$e(ie++,3);!E.__s&&dt(i.__H,t)&&(i.__=e,i.u=t,I.__H.__h.push(i))}function M(e){return ne=5,ut(function(){return{current:e}},[])}function ut(e,t){var i=$e(ie++,7);return dt(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function G(e,t){return ne=8,ut(function(){return e},t)}function Ft(){for(var e;e=lt.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(ce),t.__h.some(we),t.__h=[]}catch(i){t.__h=[],E.__e(i,e.__v)}}}E.__b=function(e){I=null,Ue&&Ue(e)},E.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Ge&&Ge(e,t)},E.__r=function(e){Me&&Me(e),ie=0;var t=(I=e.__c).__H;t&&(be===I?(t.__h=[],I.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(ce),t.__h.some(we),t.__h=[],ie=0)),be=I},E.diffed=function(e){De&&De(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(lt.push(t)!==1&&Be===E.requestAnimationFrame||((Be=E.requestAnimationFrame)||At)(Ft)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),be=I=null},E.__c=function(e,t){t.some(function(i){try{i.__h.some(ce),i.__h=i.__h.filter(function(r){return!r.__||we(r)})}catch(r){t.some(function(o){o.__h&&(o.__h=[])}),t=[],E.__e(r,i.__v)}}),He&&He(e,t)},E.unmount=function(e){Re&&Re(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(r){try{ce(r)}catch(o){t=o}}),i.__H=void 0,t&&E.__e(t,i.__v))};var We=typeof requestAnimationFrame=="function";function At(e){var t,i=function(){clearTimeout(r),We&&cancelAnimationFrame(t),setTimeout(e)},r=setTimeout(i,35);We&&(t=requestAnimationFrame(i))}function ce(e){var t=I,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),I=t}function we(e){var t=I;e.__c=e.__(),I=t}function dt(e,t){return!e||e.length!==t.length||t.some(function(i,r){return i!==e[r]})}function ct(e,t){return typeof t=="function"?t(e):t}function Ot(e){const t=e.reduce((r,o)=>r+(o.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const r of e)if(i-=r.trafficPct??0,i<=0)return r;return e[e.length-1]}function jt(e,t){const i={};for(const o of Object.values(e.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const n=o.variantGroupId;i[n]||(i[n]=[]),i[n].push(o)}const r={};for(const[o,n]of Object.entries(i)){const a=`quiz_${t}_vg_${o}`,u=localStorage.getItem(a),l=u?e.nodes[u]:null,d=l&&l.kind==="step"?l.trafficPct??0:0;if(l&&d>0)r[o]=u;else{const p=Ot(n);localStorage.setItem(a,p.id),r[o]=p.id}}return r}function Ve(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function Nt(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function K(e,t,i,r,o,n={}){const a=Ve(e,t);if(a.length===0)return null;let u=null;if(i!==null){const p=a.find(s=>Nt(s.condition,i,r));p&&(u=p.to)}u===null&&(u=(a.find(s=>!s.condition||s.condition.kind==="default")??a[0]).to);let l=Qe(e,u,o);const d=new Set;for(;l&&l.kind==="step"&&Bt(l,n)&&!d.has(l.id);){d.add(l.id);const p=Ve(e,l.id);if(p.length===0)break;const s=p.find(f=>!f.condition||f.condition.kind==="default")??p[0];l=Qe(e,s.to,o)}return l}function Bt(e,t){return!!(e.skipAlways||e.skipIfVarSet&&(t[e.skipIfVarSet]??"")!=="")}function Qe(e,t,i){const r=e.nodes[t];if(!r)return null;if(r.kind!=="step")return r;if(r.variantGroupId){const o=i[r.variantGroupId];if(o)return e.nodes[o]??r}return r}function Ut(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function Mt(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const r of i){const o=e.get(r);o&&(t[r]=o)}return t}const se=50;class Dt{constructor(t,i,r){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.apiEventsUrl=`${r}/api/quiz/events`,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flushBeacon()}),window.addEventListener("pagehide",()=>this.flushBeacon())}setSessionId(t){this.sessionId=t,this.flush()}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(!this.sessionId||this.buf.length===0)return;const t=this.sessionId,i=this.buf.splice(0);for(let r=0;r<i.length;r+=se){const o=i.slice(r,r+se);try{await this.flushFn(t,o)}catch{this.buf.unshift(...i.slice(r));return}}}flushBeacon(){if(!this.sessionId||this.buf.length===0)return;const t=this.sessionId,i=this.buf.splice(0);for(let r=0;r<i.length;r+=se){const o=i.slice(r,r+se),n=JSON.stringify({session_id:t,events:o.map(u=>({event_type:u.event_type,step_id:u.step_id,variant_group_id:u.variant_group_id,option_id:u.option_id,meta:u.meta}))});let a=!1;try{if(typeof navigator<"u"&&typeof navigator.sendBeacon=="function"){const u=new Blob([n],{type:"text/plain"});a=navigator.sendBeacon(this.apiEventsUrl,u)}}catch{a=!1}if(!a)try{fetch(this.apiEventsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:n,keepalive:!0})}catch{this.buf.unshift(...i.slice(r));return}}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function Ht(e,t,i,r,o){const n=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:r,ua:navigator.userAgent,market:o})});if(!n.ok)throw new Error(`session start failed: ${n.status}`);return(await n.json()).session_id}async function Rt(e,t,i,r,o){const n=[1e3,3e3,9e3];let a;for(let u=0;u<=n.length;u++)try{return await Ht(e,t,i,r,o)}catch(l){a=l,u<n.length&&await new Promise(d=>setTimeout(d,n[u]))}throw a}async function Gt(e,t,i){const r={session_id:t,events:i.map(n=>({event_type:n.event_type,step_id:n.step_id,variant_group_id:n.variant_group_id,option_id:n.option_id,meta:n.meta}))},o=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function Wt(e,t,i,r){const o=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:r})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const Vt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},loadingCheckout:{se:"Tar dig till kassan...",dk:"Tager dig til kassen...",no:"Tar deg til kassen...",en:"Taking you to checkout..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function B(e,t){const i=t??"en",r=Vt[e];return i in r?r[i]:r.en}function pt(e){if(!e)return;const t=i=>{i.removeAttribute("class");const r=i.getAttribute("style");if(r){const o=r.split(";").map(n=>n.trim()).filter(n=>/^color\s*:/i.test(n)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))t(o)};for(const i of Array.from(e.children))t(i)}function ze(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Qt(e){if(!e)return e;const t=e.slice(-1).toLowerCase();return t==="s"||t==="x"||t==="z"?e:e+"s"}const Ze={name:"Din valp",breed:"din valp",primary_pain:"beteendeproblem",primary_pain_value:"beteendet",problem_duration:"ett tag",upcoming_event_value:"",time_per_day:"10 min/dag",age:"valpen",age_value:"okänd",gender:"valpen",gender_value:"den"};function Ke(e,t){if(t!=null&&t.trim()!=="")return t;if(e in Ze)return Ze[e]}function oe(e,t){return e.includes("{")?e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,r)=>{if(r.endsWith("_pos")){const a=r.slice(0,-4),u=t?.[a],l=Ke(a,u);return l==null?i:ze(l==="Din valp"?"Din valps":Qt(l))}const o=t?.[r],n=Ke(r,o);return n==null?i:ze(n)}):e}function Zt({el:e,variables:t}){const i=M(null),r=oe(e.text,t);return A(()=>{i.current&&(i.current.innerHTML=r,pt(i.current))},[r]),c("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function Kt({el:e,variables:t}){const i=M(null),r=oe(e.text,t);return A(()=>{i.current&&(i.current.innerHTML=r,pt(i.current))},[r]),c("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function Jt({el:e}){return c("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function Xt({el:e,variables:t,onVariableChange:i}){const[r,o]=F(t?.[e.variable]??"");A(()=>{i?.(e.variable,r)},[r,e.variable,i]);const n=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return c("input",{type:n,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:r,min:e.min,max:e.max,onInput:a=>o(a.target.value)})}function Yt({el:e,variables:t,onVariableChange:i}){const[r,o]=F(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));A(()=>{i?.(e.variable,String(r))},[r,e.variable,i]);const n=e.unit??"",a=(r-e.min)/(e.max-e.min)*100;return c("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-range-value",children:[r,n&&` ${n}`]}),c("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:r,style:`--quiz-range-pct: ${a}%`,onInput:u=>o(Number(u.target.value))}),c("div",{class:"quiz-range-bounds",children:[c("span",{children:[e.min,n&&` ${n}`]}),c("span",{children:[e.max,n&&` ${n}`]})]})]})}function ei({el:e}){const[t,i]=F(0),r=e.items.length;if(r===0)return null;const o=e.items[t],n=()=>i(u=>(u+1)%r),a=()=>i(u=>(u-1+r)%r);return c("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-testimonial-card",children:[o.avatar&&c("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),c("div",{class:"quiz-testimonial-body",children:[c("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&c("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),c("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),c("div",{class:"quiz-testimonial-text",children:o.text})]})]}),r>1&&c("div",{class:"quiz-testimonial-nav",children:[c("button",{type:"button",class:"quiz-testimonial-prev",onClick:a,"aria-label":"Previous",children:"←"}),c("span",{class:"quiz-testimonial-dots",children:Array.from({length:r},(u,l)=>c("button",{type:"button",class:`quiz-testimonial-dot${l===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(l),"aria-label":`Go to testimonial ${l+1}`},l))}),c("button",{type:"button",class:"quiz-testimonial-next",onClick:n,"aria-label":"Next",children:"→"})]})]})}function ti(e){let t="",i="'Quicksand', system-ui, -apple-system, sans-serif",r="#1A1A1A",o="transparent";if(typeof window<"u"&&typeof document<"u"){const n=getComputedStyle(document.documentElement),a=(l,d)=>n.getPropertyValue(l).trim()||d;i=a("--quiz-font",i),r=a("--quiz-text-primary",r),o=a("--quiz-bg",o),t=["--quiz-bg","--quiz-text-primary","--quiz-text-secondary","--quiz-brand","--quiz-option-bg","--quiz-option-border","--quiz-option-selected-bg","--quiz-option-radius","--quiz-option-padding","--quiz-option-border-width","--quiz-cta-radius","--quiz-cta-padding","--quiz-step-gap","--quiz-font"].map(l=>`  ${l}: ${a(l,"").trim()||"initial"};`).join(`
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
  color: ${r};
  background: ${o};
  -webkit-font-smoothing: antialiased;
}
body { padding: 0; margin: 0; }
</style>
</head>
<body>${e}</body>
</html>`}function ii(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function ni(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const r of Array.from(e.querySelectorAll(i)))r.parentNode?.removeChild(r);e.innerText.trim().length===0&&(e.style.display="none")}function ri({el:e,variables:t}){const i=M(null),r=M(null),o=oe(e.html,t),n=ii(o);if(A(()=>{n||!i.current||(i.current.innerHTML=o,ni(i.current))},[o,n]),A(()=>{if(!n||!r.current)return;const a=r.current;let u=null,l=0;const d=[],p=()=>{try{const f=a.contentDocument;if(!f)return;const m=f.documentElement,z=f.body,h=Math.max(m?.scrollHeight??0,m?.offsetHeight??0,z?.scrollHeight??0,z?.offsetHeight??0);h>0&&(a.style.height=h+"px")}catch{}},s=()=>{p(),l=requestAnimationFrame(p);try{const f=a.contentDocument;if(!f)return;typeof ResizeObserver<"u"&&(u=new ResizeObserver(p),u.observe(f.documentElement),f.body&&u.observe(f.body));for(const m of Array.from(f.images)){if(m.complete)continue;const z=()=>p();m.addEventListener("load",z),m.addEventListener("error",z),d.push({img:m,handler:z})}}catch{}};return a.addEventListener("load",s),s(),()=>{a.removeEventListener("load",s),u?.disconnect();for(const{img:f,handler:m}of d)f.removeEventListener("load",m),f.removeEventListener("error",m);l&&cancelAnimationFrame(l)}},[o,n]),n){const a=ti(o);return c("iframe",{ref:r,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:a,scrolling:"no",title:`Custom block ${e.id}`})}return c("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function oi({el:e,onComplete:t,variables:i}){A(()=>{const o=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(o)},[e.seconds,t]);const r=oe(e.text??"",i);return c("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[c("div",{class:"quiz-loading-spinner"}),r&&c("p",{class:"quiz-loading-text",children:r})]})}function ai({option:e,layout:t,selected:i,onClick:r,variables:o,kindOf:n}){const a=["quiz-option",`quiz-option--${t}`,n==="multi"?"quiz-option--multi":"",i?"quiz-option--selected":""].filter(Boolean).join(" "),u=oe(e.label,o),l=n==="multi"&&(t==="list"||t==="cards"||t==="image_cards"||t==="image_list"),d=n==="single"&&(t==="list"||t==="cards"||t==="image_cards"||t==="image_list");return c("button",{class:a,"data-quiz-opt-id":e.id,"data-quiz-opt-value":e.value,onClick:r,type:"button",children:[(t==="image_cards"||t==="image_list")&&e.imageUrl&&c("img",{src:e.imageUrl,alt:u,class:"quiz-option-img"}),(t==="image_cards"||t==="image_list")&&!e.imageUrl&&e.imageDescription&&c("span",{class:"quiz-option-img-placeholder",title:e.imageDescription,children:c("span",{class:"quiz-option-img-placeholder-label",children:e.imageDescription})}),t==="image_cards"?c("span",{class:"quiz-option-row",children:[e.emoji&&c("span",{class:"quiz-option-emoji",children:e.emoji}),c("span",{class:"quiz-option-label",children:u})]}):c(re,{children:[e.emoji&&c("span",{class:"quiz-option-emoji",children:e.emoji}),c("span",{class:"quiz-option-label",children:u})]}),d&&c("span",{class:"quiz-option-arrow","aria-hidden":"true",children:c("svg",{viewBox:"0 0 20 20",width:"16",height:"16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:c("path",{d:"M7 5L13 10L7 15",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"})})}),l&&c("span",{class:`quiz-option-checkbox${i?" quiz-option-checkbox--checked":""}`,"aria-hidden":"true",children:i&&c("svg",{viewBox:"0 0 20 20",width:"14",height:"14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:c("path",{d:"M4 10.5L8 14.5L16 6.5",stroke:"#FFFFFF","stroke-width":"2.5","stroke-linecap":"round","stroke-linejoin":"round"})})})]})}function si({el:e,onAnswer:t,market:i,variables:r}){const[o,n]=F(new Set),a=l=>{e.kindOf==="single"?(n(new Set([l])),e.layout!=="dropdown"&&setTimeout(()=>t(e.id,l),200)):n(d=>{const p=new Set(d);return p.has(l)?p.delete(l):p.add(l),p})};if(e.layout==="dropdown")return c("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:"quiz-question quiz-question--dropdown",children:[c(li,{el:e,selected:o,onPick:l=>a(l),market:i}),o.size>0&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>t(e.id,[...o][0]),children:[B("continue",i),e.kindOf==="multi"?` (${o.size})`:""]}),e.escapeOption&&c("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]});const u=e.escapeOption?e.options.filter(l=>l.id!==e.escapeOption.optionId):e.options;return c("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[u.map(l=>c(ai,{option:l,layout:e.layout,selected:o.has(l.id),onClick:()=>a(l.id),variables:r,kindOf:e.kindOf},l.id)),(e.kindOf==="multi"||e.kindOf==="single"&&e.escapeOption)&&c("div",{class:"quiz-question-bottom",children:[e.kindOf==="multi"&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",disabled:o.size===0,onClick:()=>{if(o.size===0)return;const l=[...o][0];t(e.id,l)},children:B("continue",i)}),e.escapeOption&&c("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]})]})}function li({el:e,selected:t,onPick:i,market:r}){const o=e.kindOf==="multi",n=e.options.filter(g=>t.has(g.id)),a=n.length>0,u=!o&&a?n[0].label:"",[l,d]=F(u),[p,s]=F(!1),f=M(null),m=M(null);A(()=>{const g=P=>{f.current&&!f.current.contains(P.target)&&s(!1)};return document.addEventListener("mousedown",g),()=>document.removeEventListener("mousedown",g)},[]);const z=l.trim().toLowerCase(),h=!o&&a&&n[0].label.toLowerCase()===z,k=z?e.options.filter(g=>g.label.toLowerCase().includes(z)):e.options,y=p&&!h,q=e.dropdownPlaceholder||(e.searchable?B("searchPlaceholder",r):B("selectPlaceholder",r));return c("div",{class:`quiz-dropdown${p?" quiz-dropdown--open":""}${o?" quiz-dropdown--multi":""}`,ref:f,children:[o&&a&&c("div",{class:"quiz-dropdown-chips quiz-dropdown-chips--stack",children:[n.slice(0,4).map(g=>c("span",{class:"quiz-dropdown-chip",children:g.label},g.id)),n.length>4&&c("span",{class:"quiz-dropdown-chip quiz-dropdown-chip--more",children:["+",n.length-4]})]}),c("input",{ref:m,type:"text",class:"quiz-dropdown-input",placeholder:q,value:l,autoComplete:"off",autoCapitalize:"words",spellcheck:!1,onFocus:()=>s(!0),onInput:g=>{d(g.target.value),s(!0)}}),y&&c("ul",{class:"quiz-dropdown-list",children:[k.length===0&&c("li",{class:"quiz-dropdown-empty",children:B("noMatches",r)}),k.slice(0,50).map(g=>{const P=t.has(g.id);return c("li",{children:c("button",{type:"button",class:`quiz-dropdown-item${P?" quiz-dropdown-item--selected":""}`,"data-quiz-opt-id":g.id,onMouseDown:S=>{S.preventDefault()},onClick:()=>{i(g.id),o?(d(""),m.current?.focus()):(d(g.label),s(!1),m.current?.blur())},children:[o&&c("span",{class:`quiz-dropdown-check${P?" quiz-dropdown-check--on":""}`,"aria-hidden":"true",children:P?"✓":""}),g.emoji&&c("span",{class:"quiz-dropdown-emoji",children:g.emoji}),g.label]})},g.id)})]})]})}function ui({onSubmit:e,market:t}){const[i,r]=F(""),[o,n]=F("");return c("form",{class:"quiz-email-form",onSubmit:u=>{if(u.preventDefault(),!i.includes("@")){n(B("invalidEmail",t));return}n(""),e(i)},novalidate:!0,children:[c("input",{type:"email",class:"quiz-email-input",placeholder:B("emailPlaceholder",t),value:i,onInput:u=>r(u.target.value),required:!0}),o&&c("p",{class:"quiz-email-error",children:o}),c("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:B("continue",t)})]})}function di(){const t="quiz-offer-timer-end",[i,r]=F(600);A(()=>{let a;try{const d=sessionStorage.getItem(t);d?a=parseInt(d,10):(a=Date.now()+600*1e3,sessionStorage.setItem(t,String(a)))}catch{a=Date.now()+600*1e3}const u=()=>{const d=Math.max(0,Math.floor((a-Date.now())/1e3));r(d)};u();const l=setInterval(u,1e3);return()=>clearInterval(l)},[]);const o=String(Math.floor(i/60)).padStart(2,"0"),n=String(i%60).padStart(2,"0");return c("div",{class:"quiz-offer-timer",children:[c("span",{class:"quiz-offer-timer-text",children:"Personligt erbjudande löper ut"}),c("span",{class:"quiz-offer-timer-clock",children:[o,":",n]})]})}function ci({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:r,captureAtStepId:o,market:n,onContinue:a,variables:u,onVariableChange:l}){const d=e.subEls.some(h=>h.kind==="question"),p=e.subEls.some(h=>h.kind==="loading"),s=!!e.name&&/^commit/i.test(e.name),f=!d&&!p&&!s&&typeof a=="function",m=e.subEls.filter(h=>h.kind==="text_input"),z=f&&m.length>0&&m.some(h=>{const k=u?.[h.variable];return k==null||k.trim().length===0});return c("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(h=>{switch(h.kind){case"title":return c(Zt,{el:h,variables:u},h.id);case"text":return c(Kt,{el:h,variables:u},h.id);case"image":return c(Jt,{el:h},h.id);case"custom_html":return c(ri,{el:h,variables:u},h.id);case"loading":return c(oi,{el:h,onComplete:i,variables:u},h.id);case"question":return c(si,{el:h,onAnswer:t,market:n,variables:u},h.id);case"text_input":return c(Xt,{el:h,variables:u,onVariableChange:l},h.id);case"range_slider":return c(Yt,{el:h,variables:u,onVariableChange:l},h.id);case"testimonial_slider":return c(ei,{el:h},h.id)}}),o===e.id&&c(ui,{onSubmit:r,market:n}),f&&c("div",{class:"quiz-continue-wrap","data-step-name":e.name??"",children:[c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,disabled:z,children:B("continue",n)}),m.map(h=>h.skipLabel?c("button",{class:"quiz-escape-link",type:"button",onClick:()=>{l?.(h.variable,""),a?.()},children:h.skipLabel},h.id):null)]})]})}function pi({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return c("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:c("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function fi(e){const{brandColors:t,fontSettings:i}=e,r=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const a=document.createElement("link");a.rel="stylesheet",a.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(a)}const o=e.design??{},n=document.createElement("style");n.textContent=`
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
  --quiz-font: ${r};
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
/* image_list = PawChamp-style full-width rad med thumbnail vänster, label
 * center. För frågor med 4+ options där 2-kol grid blir för utrymmeskrävande
 * (t.ex. doginwork Block 9 - 7 beteendeproblem). (William 2026-05-12) */
.quiz-question--image_list { flex-direction: column; gap: 10px; }
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

/* image_list option = row with 56x56 thumbnail left, label flex center,
 * checkbox/arrow right. Restores pre-Woofz Block 9 design. */
.quiz-option--image_list {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.quiz-option--image_list .quiz-option-img { width: 56px; height: 56px; max-width: 56px; aspect-ratio: 1 / 1; border-radius: 8px; flex: 0 0 56px; object-fit: cover; margin: 0; }
.quiz-option--image_list .quiz-option-img-placeholder { width: 56px; height: 56px; flex: 0 0 56px; border-radius: 8px; padding: 6px; }
.quiz-option--image_list .quiz-option-label { padding: 0; font-size: 15px; font-weight: 500; flex: 1; line-height: 1.3; text-align: left; }

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

/* Continue + escape-link wrapper for multi-select / single-with-escape.
 * Non-sticky: sits naturally below the last option. User scrolls past all
 * options before reaching the CTA - works better for long lists where a
 * sticky CTA hides content. (William 2026-05-12)
 *
 * flex-basis: 100% breaks out of the parent .quiz-question flex-row (chips
 * + image_cards use row layout) so the wrapper is its own full-width row. */
.quiz-question-bottom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 16px;
  padding: 0 env(safe-area-inset-bottom);
  width: 100%;
  flex-basis: 100%;
}
.quiz-question-bottom .quiz-escape-link { align-self: center; }
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
/* Modest breathing room at end of scroll - CTAs are inline (non-sticky), so
 * no buffer needed for fixed bars. */
.quiz-content { padding-bottom: 32px; }

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

/* Inline Continue (slider/text_input/custom_html): non-sticky, sits naturally
 * after the input/content. (William 2026-05-12 - simplified after removing
 * sticky CTAs across quiz to avoid scroll-hint/fade workarounds.) */
.quiz-continue-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 24px;
  padding: 0 16px env(safe-area-inset-bottom);
}
.quiz-continue-wrap .quiz-btn--primary {
  width: 100%;
  max-width: 680px;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
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
  /* Mobile: tight horizontal padding. */
  .quiz-content { padding: 20px 10px 32px; }
}
  `,document.head.appendChild(n)}function mi(e){const t=Object.values(e.nodes).filter(l=>l.kind==="step"),i=new Set(t.map(l=>l.id)),r=new Map;for(const l of t){if(!l.variantGroupId)continue;const d=r.get(l.variantGroupId)??[];d.push(l),r.set(l.variantGroupId,d)}const o=Object.values(e.nodes).find(l=>l.kind==="start"),n=[];if(o)for(const l of Object.values(e.edges))l.from===o.id&&i.has(l.to)&&n.push(l.to);else for(const l of t)n.push(l.id);const a=new Set,u=[];for(;n.length;){const l=n.shift();if(a.has(l))continue;a.add(l);const d=e.nodes[l];if(d&&d.kind==="step"&&(u.push(d),d.variantGroupId)){const p=r.get(d.variantGroupId)??[];for(let s=p.length-1;s>=0;s--){const f=p[s];f.id!==l&&!a.has(f.id)&&n.unshift(f.id)}}for(const p of Object.values(e.edges))p.from===l&&i.has(p.to)&&!a.has(p.to)&&n.push(p.to)}for(const l of t)a.has(l.id)||u.push(l);return u}function _i({node:e,onTrigger:t}){const i=M(!1);return A(()=>{i.current||(i.current=!0,t(e))},[e,t]),null}function ee(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function hi({data:e,settings:t,config:i,abVariant:r,abExperimentId:o}){const[n,a]=F(null),[u,l]=F([]),[d,p]=F(null),[s,f]=F({}),[m,z]=F(0),[h,k]=F(null),[y,q]=F(!1),[g,P]=F({}),S=M(null),J=M(null),V=M(!1);A(()=>{if(!h)return;const _=setTimeout(()=>k(null),4e3);return()=>clearTimeout(_)},[h]),A(()=>{const _=window.visualViewport;if(!_)return;const b=()=>{const v=Math.max(0,window.innerHeight-_.height-_.offsetTop);document.documentElement.style.setProperty("--quiz-keyboard-inset",`${v}px`)};return b(),_.addEventListener("resize",b),_.addEventListener("scroll",b),()=>{_.removeEventListener("resize",b),_.removeEventListener("scroll",b)}},[]);const Q=mi(e),j=new Set,D=Q.filter(_=>_.variantGroupId?j.has(_.variantGroupId)?!1:(j.add(_.variantGroupId),!0):!0),Ee=D.length,Te=_=>D.findIndex(b=>_.variantGroupId?b.variantGroupId===_.variantGroupId:b.id===_.id);A(()=>{if(V.current)return;V.current=!0;try{const T=new URLSearchParams(location.search).get("variant");if(T){const N={};for(const C of Object.values(e.nodes))C.kind!=="step"||!C.variantGroupId||(N[C.variantGroupId]||(N[C.variantGroupId]=[]),N[C.variantGroupId].push(C.id));const H=T.toUpperCase();for(const[C,$]of Object.entries(N)){let L=null;H==="A"||H==="0"?L=$[0]:H==="B"||H==="1"?L=$[1]??$[0]:e.nodes[T]&&(L=T),L&&localStorage.setItem(`quiz_${i.quizId}_vg_${C}`,L)}}}catch{}const _=jt(e,i.quizId);o&&r&&(_[`ab_${o}`]=r),f(_);const b=Ut(e);if(!b){console.error("[quiz-runtime] No start node found");return}let v=K(e,b.id,null,null,_,{});try{const x=new URLSearchParams(location.search),T=x.get("goto");if(T&&T.trim()){const N=T.trim().toLowerCase(),H=Object.values(e.nodes).filter(L=>L.kind==="step"),$=H.find(L=>(L.name??"").toLowerCase()===N)??H.find(L=>(L.name??"").toLowerCase().includes(N));if($){if(v=$,$.kind==="step"&&$.variantGroupId){_[$.variantGroupId]=$.id,f({..._});try{localStorage.setItem(`quiz_${i.quizId}_vg_${$.variantGroupId}`,$.id)}catch{}}const L={name:"Bella",name_pos:"Bellas",gender:"Hane",gender_value:"han",breed:"Golden retriever",primary_pain:"Drar i kopplet",primary_pain_value:"koppeldragning",age:"7-12 månader",age_value:"7-12 mån",time_per_day:"10 min/dag",ignores_owner_value:"Spridd",seeks_affection_value:"Stark"},Y=x.get("vars");Y&&Y.split(",").forEach(yt=>{const[Le,Fe]=yt.split(":");Le&&Fe&&(L[Le.trim()]=Fe.trim())}),P(L),console.info(`[quiz-runtime] goto=${T} → ${$.id} (${$.kind==="step"?$.name:""})`)}else console.warn(`[quiz-runtime] goto=${T} no match`)}}catch{}if(a(v),!i.preview&&t.providers.metaPixel?.pixelId&&ee("PageView",{}),i.preview)return;S.current=new Dt(null,(x,T)=>Gt(i.apiBaseUrl,x,T),i.apiBaseUrl),v&&v.kind==="step"&&S.current.push({event_type:"step_view",step_id:v.id,variant_group_id:v.variantGroupId});const O=Mt();Rt(i.apiBaseUrl,i.quizId,_,O,e.id??"").then(x=>{p(x),J.current=x,S.current?.setSessionId(x)}).catch(x=>{console.warn("[quiz-runtime] session start failed after retries:",x)})},[]),A(()=>()=>S.current?.destroy(),[]),A(()=>{const _=b=>{const v=b.data;if(!v||typeof v!="object")return;if(v.type==="quiz-modal-open"){q(!0);return}if(v.type==="quiz-modal-close"){q(!1);return}if(v.type==="quiz-runtime-event"&&typeof v.event_type=="string"){!i.preview&&n&&n.kind==="step"&&(S.current?.push({event_type:v.event_type,step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof v.option_id=="string"?v.option_id:void 0,meta:v.meta&&typeof v.meta=="object"?v.meta:void 0}),t.providers.metaPixel?.pixelId&&typeof v.option_id=="string"&&v.option_id.endsWith("_yes")&&ee("Lead",{content_name:t.metadata.title,content_category:"commit_gate"}));return}if(v.type!=="quiz-runtime-continue"||!n||n.kind!=="step")return;if(!i.preview){const x=typeof v.value=="string"?v.value:"yes";x==="offer_cta_click"&&S.current?.push({event_type:"cta_click",step_id:n.id,variant_group_id:n.variantGroupId,meta:{source:"offer_page"}}),S.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:x,meta:{source:"commit_gate_modal"}})}const O=K(e,n.id,null,null,s,g);O&&U(O)};return window.addEventListener("message",_),()=>window.removeEventListener("message",_)},[n,e,s,g,i.preview,t]),A(()=>{if(!n||n.kind!=="step")return;const _=n;if(_.subEls.length===0){const b=K(e,_.id,null,null,s,g);b&&b.id!==n.id&&U(b,!1)}},[n,g]);const U=G((_,b=!0)=>{if(b&&n&&l(v=>[...v,n]),a(_),_.kind==="step"){const v=Te(_);v>=0&&z(v),i.preview||(S.current?.push({event_type:"step_view",step_id:_.id,variant_group_id:_.variantGroupId}),t.providers.metaPixel?.pixelId&&_.kind==="step"&&(_.name??"").toLowerCase().includes("offer")&&ee("InitiateCheckout",{content_name:t.metadata.title,content_category:"offer_page"}))}},[n,Q,i.preview,t]),ft=G((_,b)=>{if(!n||n.kind!=="step")return;const v=n.subEls.find(x=>x.id===_&&x.kind==="question");if(v&&v.kind==="question"&&v.variable){const x=v.options.find(T=>T.id===b);x&&P(T=>({...T,[v.variable]:x.label,...x.value!==void 0?{[`${v.variable}_value`]:x.value}:{}}))}i.preview||S.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:b,meta:{questionElId:_}});const O=K(e,n.id,b,_,s,g);O&&U(O)},[n,e,s,g,U]),mt=G((_,b)=>{P(v=>({...v,[_]:b}))},[]),_t=G(()=>{if(!n||n.kind!=="step")return;const _=K(e,n.id,null,null,s,g);_&&U(_)},[n,e,s,g,U]),ht=G(()=>{if(!n||n.kind!=="step")return;const _=K(e,n.id,null,null,s,g);_&&U(_)},[n,e,s,g,U]),gt=G(async _=>{if(!i.preview){S.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:_}}),t.providers.metaPixel?.pixelId&&ee("Lead",{content_name:t.metadata.title,value:0});const b=J.current;if(t.providers.klaviyo?.listId&&b)try{await Wt(i.apiBaseUrl,b,_,t.providers.klaviyo.listId)}catch(v){console.warn("[quiz-runtime] Klaviyo subscribe failed:",v)}}if(n&&n.kind==="step"){const b=K(e,n.id,null,null,s,g);b&&U(b)}},[n,e,s,g,U,d,t,i]),vt=G(()=>{i.preview||S.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),l(_=>{if(_.length===0)return _;const b=_[_.length-1],v=_.slice(0,-1);if(a(b),b.kind==="step"){const O=Te(b);O>=0&&z(O)}return v})},[n,Q]),bt=G(_=>{if(i.preview){const x=_.redirectUrl||t.redirectUrl||"(no redirect URL)";k(`[Preview] Would redirect to: ${x}`);return}S.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&ee("CompleteRegistration",{content_name:t.metadata.title,value:0});const b=()=>{const x=J.current,T=_.redirectUrl||t.redirectUrl||"",N=new URL(T,location.href),H=/^\/cart\/\d+:\d+/i.test(N.pathname),C=(L,Y)=>{H?N.searchParams.set(`attributes[${L}]`,Y):N.searchParams.set(L,Y)};C("utm_source","quiz"),C("utm_medium","funnel"),C("utm_campaign",i.quizSlug||"quiz"),x&&C("utm_content",x);const $=g.primary_pain_value||g.primary_pain;return $&&C("utm_term",$),x&&C("qz_sid",x),$&&C("qz_pain",$),g.breed&&C("qz_breed",g.breed),g.time_per_day&&C("qz_time",g.time_per_day),g.age&&C("qz_age",g.age),N.toString()},v=S.current?.flush().catch(()=>{})??Promise.resolve(),O=new Promise(x=>setTimeout(x,1500));Promise.race([v,O]).finally(()=>{location.href=b()})},[t,d,i.preview,i.quizSlug,g]);if(n?.kind==="exit"){const _=n,b=_.redirectUrl||t.redirectUrl||"";let v=!1;try{const x=new URL(b,location.href);v=/^\/cart\/\d+:\d+/i.test(x.pathname)}catch{}const O=B(v?"loadingCheckout":"loadingResults",i.market);return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-content quiz-exit",children:[c(_i,{node:_,onTrigger:bt}),c("div",{class:"quiz-loading-spinner"}),c("p",{class:"quiz-text",children:O})]}),h&&c("div",{class:"quiz-preview-toast",children:h})]})}if(!n||n.kind!=="step")return c("div",{class:"quiz-shell",children:c("div",{class:"quiz-content",children:c("div",{class:"quiz-loading",children:c("div",{class:"quiz-loading-spinner"})})})});const Z=n,zt=t.backNavigation&&u.length>0,xt=t.providers.klaviyo?.captureAtStepId,Pe=!!Z.name&&/Block 24 - Profil/i.test(Z.name),ge=!!Z.name&&/^Offer page/i.test(Z.name),qt=["quiz-shell",y&&"modal-active",Pe&&"profil-step",ge&&"offer-step"].filter(Boolean).join(" ");return c("div",{class:qt,children:[c("div",{class:"quiz-header",children:[c("div",{class:"quiz-header-side quiz-header-side--start",children:zt&&c("button",{class:"quiz-back-btn",type:"button",onClick:vt,"aria-label":"Go back",children:"←"})}),t.brandLogo?.enabled&&t.brandLogo.url&&c("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),c("div",{class:"quiz-header-side quiz-header-side--end",children:t.stepProgressCount&&c("span",{class:"quiz-step-count",children:[m+1," / ",Ee]})})]}),t.progressBar&&!Pe&&!ge&&c(pi,{current:m+1,total:Ee}),ge&&!/\(.*variant.*\)/i.test(Z.name??"")&&c(di,{}),c("div",{class:"quiz-content",children:c(ci,{node:Z,onAnswer:ft,onLoadingComplete:_t,onEmailSubmit:gt,captureAtStepId:xt,market:i.market,onContinue:ht,variables:g,onVariableChange:mt},Z.id)})]})}function gi(e,t){const i=`quiz_${e}_ab_${t.id}`;try{const o=new URLSearchParams(location.search).get("ab");if(o){const n=o.toUpperCase()==="B"?"b":"a";return localStorage.setItem(i,n),n}}catch{}try{const o=localStorage.getItem(i);if(o==="a"||o==="b")return o}catch{}const r=Math.random()*100<(t.splitA??50)?"a":"b";try{localStorage.setItem(i,r)}catch{}return r}function Je(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__,r=window.__QUIZ_AB__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}fi(t);const o=document.getElementById("quiz-root");if(!o){console.error("[quiz-runtime] #quiz-root element not found");return}let n=e,a,u;r&&r.id&&r.dataB&&(u=r.id,a=gi(i.quizId,r),a==="b"&&(n=r.dataB)),Tt(c(hi,{data:n,settings:t,config:i,abVariant:a,abExperimentId:u}),o)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Je):Je();
