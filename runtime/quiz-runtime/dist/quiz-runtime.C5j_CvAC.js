var it,g,Pt,E,vt,Et,Nt,ot,Z,D,Ut,dt,at,lt,X={},tt=[],Jt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,nt=Array.isArray;function C(t,e){for(var i in e)t[i]=e[i];return t}function pt(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function Kt(t,e,i){var n,o,r,a={};for(r in e)r=="key"?n=e[r]:r=="ref"?o=e[r]:a[r]=e[r];if(arguments.length>2&&(a.children=arguments.length>3?it.call(arguments,2):i),typeof t=="function"&&t.defaultProps!=null)for(r in t.defaultProps)a[r]===void 0&&(a[r]=t.defaultProps[r]);return J(t,a,n,o,null)}function J(t,e,i,n,o){var r={type:t,props:e,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Pt,__i:-1,__u:0};return o==null&&g.vnode!=null&&g.vnode(r),r}function rt(t){return t.children}function K(t,e){this.props=t,this.context=e}function M(t,e){if(e==null)return t.__?M(t.__,t.__i+1):null;for(var i;e<t.__k.length;e++)if((i=t.__k[e])!=null&&i.__e!=null)return i.__e;return typeof t.type=="function"?M(t):null}function Yt(t){if(t.__P&&t.__d){var e=t.__v,i=e.__e,n=[],o=[],r=C({},e);r.__v=e.__v+1,g.vnode&&g.vnode(r),ft(t.__P,r,e,t.__n,t.__P.namespaceURI,32&e.__u?[i]:null,n,i??M(e),!!(32&e.__u),o),r.__v=e.__v,r.__.__k[r.__i]=r,jt(n,r,o),e.__e=e.__=null,r.__e!=i&&At(r)}}function At(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),At(t)}function gt(t){(!t.__d&&(t.__d=!0)&&E.push(t)&&!et.__r++||vt!=g.debounceRendering)&&((vt=g.debounceRendering)||Et)(et)}function et(){try{for(var t,e=1;E.length;)E.length>e&&E.sort(Nt),t=E.shift(),e=E.length,Yt(t)}finally{E.length=et.__r=0}}function Ht(t,e,i,n,o,r,a,s,_,l,c){var u,f,d,b,y,q,m,v=n&&n.__k||tt,S=e.length;for(_=Xt(i,e,v,_,S),u=0;u<S;u++)(d=i.__k[u])!=null&&(f=d.__i!=-1&&v[d.__i]||X,d.__i=u,q=ft(t,d,f,o,r,a,s,_,l,c),b=d.__e,d.ref&&f.ref!=d.ref&&(f.ref&&ht(f.ref,null,d),c.push(d.ref,d.__c||b,d)),y==null&&b!=null&&(y=b),(m=!!(4&d.__u))||f.__k===d.__k?(_=Lt(d,_,t,m),m&&f.__e&&(f.__e=null)):typeof d.type=="function"&&q!==void 0?_=q:b&&(_=b.nextSibling),d.__u&=-7);return i.__e=y,_}function Xt(t,e,i,n,o){var r,a,s,_,l,c=i.length,u=c,f=0;for(t.__k=new Array(o),r=0;r<o;r++)(a=e[r])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=t.__k[r]=J(null,a,null,null,null):nt(a)?a=t.__k[r]=J(rt,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=t.__k[r]=J(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):t.__k[r]=a,_=r+f,a.__=t,a.__b=t.__b+1,s=null,(l=a.__i=te(a,i,_,u))!=-1&&(u--,(s=i[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(o>c?f--:o<c&&f++),typeof a.type!="function"&&(a.__u|=4)):l!=_&&(l==_-1?f--:l==_+1?f++:(l>_?f--:f++,a.__u|=4))):t.__k[r]=null;if(u)for(r=0;r<c;r++)(s=i[r])!=null&&(2&s.__u)==0&&(s.__e==n&&(n=M(s)),Ot(s,s));return n}function Lt(t,e,i,n){var o,r;if(typeof t.type=="function"){for(o=t.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=t,e=Lt(o[r],e,i,n));return e}t.__e!=e&&(n&&(e&&t.type&&!e.parentNode&&(e=M(t)),i.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function te(t,e,i,n){var o,r,a,s=t.key,_=t.type,l=e[i],c=l!=null&&(2&l.__u)==0;if(l===null&&s==null||c&&s==l.key&&_==l.type)return i;if(n>(c?1:0)){for(o=i-1,r=i+1;o>=0||r<e.length;)if((l=e[a=o>=0?o--:r++])!=null&&(2&l.__u)==0&&s==l.key&&_==l.type)return a}return-1}function xt(t,e,i){e[0]=="-"?t.setProperty(e,i??""):t[e]=i==null?"":typeof i!="number"||Jt.test(e)?i:i+"px"}function V(t,e,i,n,o){var r,a;t:if(e=="style")if(typeof i=="string")t.style.cssText=i;else{if(typeof n=="string"&&(t.style.cssText=n=""),n)for(e in n)i&&e in i||xt(t.style,e,"");if(i)for(e in i)n&&i[e]==n[e]||xt(t.style,e,i[e])}else if(e[0]=="o"&&e[1]=="n")r=e!=(e=e.replace(Ut,"$1")),a=e.toLowerCase(),e=a in t||e=="onFocusOut"||e=="onFocusIn"?a.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+r]=i,i?n?i[D]=n[D]:(i[D]=dt,t.addEventListener(e,r?lt:at,r)):t.removeEventListener(e,r?lt:at,r);else{if(o=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=i??"";break t}catch{}typeof i=="function"||(i==null||i===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&i==1?"":i))}}function bt(t){return function(e){if(this.l){var i=this.l[e.type+t];if(e[Z]==null)e[Z]=dt++;else if(e[Z]<i[D])return;return i(g.event?g.event(e):e)}}}function ft(t,e,i,n,o,r,a,s,_,l){var c,u,f,d,b,y,q,m,v,S,$,U,Q,L,B,I=e.type;if(e.constructor!==void 0)return null;128&i.__u&&(_=!!(32&i.__u),r=[s=e.__e=i.__e]),(c=g.__b)&&c(e);t:if(typeof I=="function")try{if(m=e.props,v=I.prototype&&I.prototype.render,S=(c=I.contextType)&&n[c.__c],$=c?S?S.props.value:c.__:n,i.__c?q=(u=e.__c=i.__c).__=u.__E:(v?e.__c=u=new I(m,$):(e.__c=u=new K(m,$),u.constructor=I,u.render=ie),S&&S.sub(u),u.state||(u.state={}),u.__n=n,f=u.__d=!0,u.__h=[],u._sb=[]),v&&u.__s==null&&(u.__s=u.state),v&&I.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=C({},u.__s)),C(u.__s,I.getDerivedStateFromProps(m,u.__s))),d=u.props,b=u.state,u.__v=e,f)v&&I.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),v&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(v&&I.getDerivedStateFromProps==null&&m!==d&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(m,$),e.__v==i.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(m,u.__s,$)===!1){e.__v!=i.__v&&(u.props=m,u.state=u.__s,u.__d=!1),e.__e=i.__e,e.__k=i.__k,e.__k.some(function(P){P&&(P.__=e)}),tt.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&a.push(u);break t}u.componentWillUpdate!=null&&u.componentWillUpdate(m,u.__s,$),v&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(d,b,y)})}if(u.context=$,u.props=m,u.__P=t,u.__e=!1,U=g.__r,Q=0,v)u.state=u.__s,u.__d=!1,U&&U(e),c=u.render(u.props,u.state,u.context),tt.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,U&&U(e),c=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++Q<25);u.state=u.__s,u.getChildContext!=null&&(n=C(C({},n),u.getChildContext())),v&&!f&&u.getSnapshotBeforeUpdate!=null&&(y=u.getSnapshotBeforeUpdate(d,b)),L=c!=null&&c.type===rt&&c.key==null?Ft(c.props.children):c,s=Ht(t,nt(L)?L:[L],e,i,n,o,r,a,s,_,l),u.base=e.__e,e.__u&=-161,u.__h.length&&a.push(u),q&&(u.__E=u.__=null)}catch(P){if(e.__v=null,_||r!=null)if(P.then){for(e.__u|=_?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,e.__e=s}else{for(B=r.length;B--;)pt(r[B]);_t(e)}else e.__e=i.__e,e.__k=i.__k,P.then||_t(e);g.__e(P,e,i)}else r==null&&e.__v==i.__v?(e.__k=i.__k,e.__e=i.__e):s=e.__e=ee(i.__e,e,i,n,o,r,a,_,l);return(c=g.diffed)&&c(e),128&e.__u?void 0:s}function _t(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(_t))}function jt(t,e,i){for(var n=0;n<i.length;n++)ht(i[n],i[++n],i[++n]);g.__c&&g.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(r){r.call(o)})}catch(r){g.__e(r,o.__v)}})}function Ft(t){return typeof t!="object"||t==null||t.__b>0?t:nt(t)?t.map(Ft):C({},t)}function ee(t,e,i,n,o,r,a,s,_){var l,c,u,f,d,b,y,q=i.props||X,m=e.props,v=e.type;if(v=="svg"?o="http://www.w3.org/2000/svg":v=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((d=r[l])&&"setAttribute"in d==!!v&&(v?d.localName==v:d.nodeType==3)){t=d,r[l]=null;break}}if(t==null){if(v==null)return document.createTextNode(m);t=document.createElementNS(o,v,m.is&&m),s&&(g.__m&&g.__m(e,r),s=!1),r=null}if(v==null)q===m||s&&t.data==m||(t.data=m);else{if(r=r&&it.call(t.childNodes),!s&&r!=null)for(q={},l=0;l<t.attributes.length;l++)q[(d=t.attributes[l]).name]=d.value;for(l in q)d=q[l],l=="dangerouslySetInnerHTML"?u=d:l=="children"||l in m||l=="value"&&"defaultValue"in m||l=="checked"&&"defaultChecked"in m||V(t,l,null,d,o);for(l in m)d=m[l],l=="children"?f=d:l=="dangerouslySetInnerHTML"?c=d:l=="value"?b=d:l=="checked"?y=d:s&&typeof d!="function"||q[l]===d||V(t,l,d,q[l],o);if(c)s||u&&(c.__html==u.__html||c.__html==t.innerHTML)||(t.innerHTML=c.__html),e.__k=[];else if(u&&(t.innerHTML=""),Ht(e.type=="template"?t.content:t,nt(f)?f:[f],e,i,n,v=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,a,r?r[0]:i.__k&&M(i,0),s,_),r!=null)for(l=r.length;l--;)pt(r[l]);s||(l="value",v=="progress"&&b==null?t.removeAttribute("value"):b!=null&&(b!==t[l]||v=="progress"&&!b||v=="option"&&b!=q[l])&&V(t,l,b,q[l],o),l="checked",y!=null&&y!=t[l]&&V(t,l,y,q[l],o))}return t}function ht(t,e,i){try{if(typeof t=="function"){var n=typeof t.__u=="function";n&&t.__u(),n&&e==null||(t.__u=t(e))}else t.current=e}catch(o){g.__e(o,i)}}function Ot(t,e,i){var n,o;if(g.unmount&&g.unmount(t),(n=t.ref)&&(n.current&&n.current!=t.__e||ht(n,null,e)),(n=t.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){g.__e(r,e)}n.base=n.__P=null}if(n=t.__k)for(o=0;o<n.length;o++)n[o]&&Ot(n[o],e,i||typeof t.type!="function");i||pt(t.__e),t.__c=t.__=t.__e=void 0}function ie(t,e,i){return this.constructor(t,i)}function ne(t,e,i){var n,o,r,a;e==document&&(e=document.documentElement),g.__&&g.__(t,e),o=(n=!1)?null:e.__k,r=[],a=[],ft(e,t=e.__k=Kt(rt,null,[t]),o||X,X,e.namespaceURI,o?null:e.firstChild?it.call(e.childNodes):null,r,o?o.__e:e.firstChild,n,a),jt(r,t,a)}it=tt.slice,g={__e:function(t,e,i,n){for(var o,r,a;e=e.__;)if((o=e.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(t)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,n||{}),a=o.__d),a)return o.__E=o}catch(s){t=s}throw t}},Pt=0,K.prototype.setState=function(t,e){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=C({},this.state),typeof t=="function"&&(t=t(C({},i),this.props)),t&&C(i,t),t!=null&&this.__v&&(e&&this._sb.push(e),gt(this))},K.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),gt(this))},K.prototype.render=rt,E=[],Et=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Nt=function(t,e){return t.__v.__b-e.__v.__b},et.__r=0,ot=Math.random().toString(8),Z="__d"+ot,D="__a"+ot,Ut=/(PointerCapture)$|Capture$/i,dt=0,at=bt(!1),lt=bt(!0);var re=0;function p(t,e,i,n,o,r){e||(e={});var a,s,_=e;if("ref"in _)for(s in _={},e)s=="ref"?a=e[s]:_[s]=e[s];var l={type:t,props:_,key:i,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--re,__i:-1,__u:0,__source:o,__self:r};if(typeof t=="function"&&(a=t.defaultProps))for(s in a)_[s]===void 0&&(_[s]=a[s]);return g.vnode&&g.vnode(l),l}var R,z,st,yt,G=0,Mt=[],k=g,zt=k.__b,qt=k.__r,wt=k.diffed,kt=k.__c,St=k.unmount,It=k.__;function mt(t,e){k.__h&&k.__h(z,t,G||e),G=0;var i=z.__H||(z.__H={__:[],__h:[]});return t>=i.__.length&&i.__.push({}),i.__[t]}function T(t){return G=1,oe(Rt,t)}function oe(t,e,i){var n=mt(R++,2);if(n.t=t,!n.__c&&(n.__=[Rt(void 0,e),function(s){var _=n.__N?n.__N[0]:n.__[0],l=n.t(_,s);_!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=z,!z.__f)){var o=function(s,_,l){if(!n.__c.__H)return!0;var c=n.__c.__H.__.filter(function(f){return f.__c});if(c.every(function(f){return!f.__N}))return!r||r.call(this,s,_,l);var u=n.__c.props!==s;return c.some(function(f){if(f.__N){var d=f.__[0];f.__=f.__N,f.__N=void 0,d!==f.__[0]&&(u=!0)}}),r&&r.call(this,s,_,l)||u};z.__f=!0;var r=z.shouldComponentUpdate,a=z.componentWillUpdate;z.componentWillUpdate=function(s,_,l){if(this.__e){var c=r;r=void 0,o(s,_,l),r=c}a&&a.call(this,s,_,l)},z.shouldComponentUpdate=o}return n.__N||n.__}function N(t,e){var i=mt(R++,3);!k.__s&&Dt(i.__H,e)&&(i.__=t,i.u=e,z.__H.__h.push(i))}function W(t){return G=5,Bt(function(){return{current:t}},[])}function Bt(t,e){var i=mt(R++,7);return Dt(i.__H,e)&&(i.__=t(),i.__H=e,i.__h=t),i.__}function A(t,e){return G=8,Bt(function(){return t},e)}function se(){for(var t;t=Mt.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(Y),e.__h.some(ct),e.__h=[]}catch(i){e.__h=[],k.__e(i,t.__v)}}}k.__b=function(t){z=null,zt&&zt(t)},k.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),It&&It(t,e)},k.__r=function(t){qt&&qt(t),R=0;var e=(z=t.__c).__H;e&&(st===z?(e.__h=[],z.__h=[],e.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(e.__h.some(Y),e.__h.some(ct),e.__h=[],R=0)),st=z},k.diffed=function(t){wt&&wt(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Mt.push(e)!==1&&yt===k.requestAnimationFrame||((yt=k.requestAnimationFrame)||ue)(se)),e.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),st=z=null},k.__c=function(t,e){e.some(function(i){try{i.__h.some(Y),i.__h=i.__h.filter(function(n){return!n.__||ct(n)})}catch(n){e.some(function(o){o.__h&&(o.__h=[])}),e=[],k.__e(n,i.__v)}}),kt&&kt(t,e)},k.unmount=function(t){St&&St(t);var e,i=t.__c;i&&i.__H&&(i.__H.__.some(function(n){try{Y(n)}catch(o){e=o}}),i.__H=void 0,e&&k.__e(e,i.__v))};var $t=typeof requestAnimationFrame=="function";function ue(t){var e,i=function(){clearTimeout(n),$t&&cancelAnimationFrame(e),setTimeout(t)},n=setTimeout(i,35);$t&&(e=requestAnimationFrame(i))}function Y(t){var e=z,i=t.__c;typeof i=="function"&&(t.__c=void 0,i()),z=e}function ct(t){var e=z;t.__c=t.__(),z=e}function Dt(t,e){return!t||t.length!==e.length||e.some(function(i,n){return i!==t[n]})}function Rt(t,e){return typeof e=="function"?e(t):e}function ae(t){const e=t.reduce((n,o)=>n+(o.trafficPct??0),0);if(e<=0)return t[0];let i=Math.random()*e;for(const n of t)if(i-=n.trafficPct??0,i<=0)return n;return t[t.length-1]}function le(t,e){const i={};for(const o of Object.values(t.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const a=`quiz_${e}_vg_${o}`,s=localStorage.getItem(a);if(s&&t.nodes[s])n[o]=s;else{const _=ae(r);localStorage.setItem(a,_.id),n[o]=_.id}}return n}function _e(t,e){return Object.values(t.edges).filter(i=>i.from===e)}function ce(t,e,i){return!t||t.kind==="default"?!1:t.kind==="option"?t.optionId===e&&t.questionElId===i:!1}function O(t,e,i,n,o){const r=_e(t,e);if(r.length===0)return null;if(i!==null){const s=r.find(_=>ce(_.condition,i,n));if(s)return Tt(t,s.to,o)}const a=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return Tt(t,a.to,o)}function Tt(t,e,i){const n=t.nodes[e];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return t.nodes[o]??n}return n}function de(t){return Object.values(t.nodes).find(e=>e.kind==="start")??null}function pe(){const t=new URLSearchParams(location.search),e={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=t.get(n);o&&(e[n]=o)}return e}class fe{constructor(e,i){this.sessionId=e,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(e){this.buf.push({...e,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const e=this.buf.splice(0);try{await this.flushFn(this.sessionId,e)}catch{this.buf.unshift(...e)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function he(t,e,i,n,o){const r=await fetch(`${t}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:e,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function me(t,e,i){const n={session_id:e,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${t}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function ve(t,e,i,n){const o=await fetch(`${t}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:e,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const ge={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."}};function H(t,e){const i=e??"en",n=ge[t];return i in n?n[i]:n.en}function Gt(t){if(!t)return;const e=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))e(o)};for(const i of Array.from(t.children))e(i)}function xe({el:t}){const e=W(null);return N(()=>{e.current&&(e.current.innerHTML=t.text,Gt(e.current))},[t.text]),p("h1",{ref:e,"data-quiz-el":"title","data-quiz-el-id":t.id,class:"quiz-title"})}function be({el:t}){const e=W(null);return N(()=>{e.current&&(e.current.innerHTML=t.text,Gt(e.current))},[t.text]),p("div",{ref:e,"data-quiz-el":"text","data-quiz-el-id":t.id,class:"quiz-text"})}function ye({el:t}){return p("img",{"data-quiz-el":"image","data-quiz-el-id":t.id,src:t.url,alt:t.alt,class:"quiz-image"})}function ze(t){const e=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of e)for(const n of Array.from(t.querySelectorAll(i)))n.parentNode?.removeChild(n);t.innerText.trim().length===0&&(t.style.display="none")}function qe({el:t}){const e=W(null);return N(()=>{e.current&&(e.current.innerHTML=t.html,ze(e.current))},[t.html]),p("div",{ref:e,"data-quiz-el":"custom_html","data-quiz-el-id":t.id,class:"quiz-custom-html"})}function we({el:t,onComplete:e}){return N(()=>{const i=setTimeout(e,t.seconds*1e3);return()=>clearTimeout(i)},[t.seconds,e]),p("div",{"data-quiz-el":"loading","data-quiz-el-id":t.id,class:"quiz-loading",children:[p("div",{class:"quiz-loading-spinner"}),t.text&&p("p",{class:"quiz-loading-text",children:t.text})]})}function ke({option:t,layout:e,selected:i,onClick:n}){const o=["quiz-option",`quiz-option--${e}`,i?"quiz-option--selected":""].filter(Boolean).join(" ");return p("button",{class:o,"data-quiz-opt-id":t.id,onClick:n,type:"button",children:[e==="image_cards"&&t.imageUrl&&p("img",{src:t.imageUrl,alt:t.label,class:"quiz-option-img"}),t.emoji&&p("span",{class:"quiz-option-emoji",children:t.emoji}),p("span",{class:"quiz-option-label",children:t.label})]})}function Se({el:t,onAnswer:e,market:i}){const[n,o]=T(new Set),r=a=>{t.kindOf==="single"?(o(new Set([a])),setTimeout(()=>e(t.id,a),200)):o(s=>{const _=new Set(s);return _.has(a)?_.delete(a):_.add(a),_})};return p("div",{"data-quiz-el":"question","data-quiz-el-id":t.id,class:`quiz-question quiz-question--${t.layout}`,children:[t.options.map(a=>p(ke,{option:a,layout:t.layout,selected:n.has(a.id),onClick:()=>r(a.id)},a.id)),t.kindOf==="multi"&&n.size>0&&p("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const a=[...n][0];e(t.id,a)},children:H("continue",i)})]})}function Ie({onSubmit:t,market:e}){const[i,n]=T(""),[o,r]=T("");return p("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!i.includes("@")){r(H("invalidEmail",e));return}r(""),t(i)},novalidate:!0,children:[p("input",{type:"email",class:"quiz-email-input",placeholder:H("emailPlaceholder",e),value:i,onInput:s=>n(s.target.value),required:!0}),o&&p("p",{class:"quiz-email-error",children:o}),p("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:H("continue",e)})]})}function $e({node:t,onAnswer:e,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:a}){const s=t.subEls.some(c=>c.kind==="question"),_=t.subEls.some(c=>c.kind==="loading"),l=!s&&!_&&typeof a=="function";return p("div",{class:"quiz-step","data-step-id":t.id,children:[t.subEls.map(c=>{switch(c.kind){case"title":return p(xe,{el:c},c.id);case"text":return p(be,{el:c},c.id);case"image":return p(ye,{el:c},c.id);case"custom_html":return p(qe,{el:c},c.id);case"loading":return p(we,{el:c,onComplete:i},c.id);case"question":return p(Se,{el:c,onAnswer:e,market:r},c.id)}}),o===t.id&&p(Ie,{onSubmit:n,market:r}),l&&p("div",{class:"quiz-continue-wrap",children:p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,children:H("continue",r)})})]})}function Te({current:t,total:e}){const i=e>0?Math.round(t/e*100):0;return p("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:p("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Ce(t){const{brandColors:e,fontSettings:i}=t,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${e.background};
  --quiz-text-primary: ${e.textPrimary};
  --quiz-text-secondary: ${e.textSecondary};
  --quiz-brand: ${e.primaryBrand};
  --quiz-option-bg: ${e.optionBackground};
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
  justify-content: space-between;
  padding: 16px 20px;
  gap: 12px;
}

.quiz-logo { height: 36px; object-fit: contain; }

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

.quiz-step { display: flex; flex-direction: column; gap: 20px; }

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
.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
  padding: 14px;
  min-height: 48px;
  font-size: 14.4px;
  font-weight: 400;
  line-height: 1.3;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  width: 100%;
}
.quiz-option:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.quiz-option--selected {
  background: color-mix(in srgb, var(--quiz-brand) 10%, var(--quiz-option-bg));
  border-color: var(--quiz-brand);
}
.quiz-option--cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 14px 12px;
}
.quiz-option--image_cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 0;
  background: rgb(60, 77, 83);
  border: none;
  border-radius: 10px;
  color: #fff;
  overflow: hidden;
  min-height: 0;
}
.quiz-option--image_cards .quiz-option-label { padding: 10px 8px 12px; font-size: 14.4px; font-weight: 500; }
.quiz-option-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 8px; }
.quiz-option--image_cards .quiz-option-img { aspect-ratio: 1 / 1; border-radius: 10px 10px 0 0; }
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
  padding: 16px 28px; border-radius: 12px;
  font-size: 16px; font-weight: 600; font-family: var(--quiz-font);
  cursor: pointer; border: none; transition: opacity 0.15s, transform 0.1s;
}
.quiz-btn:hover { opacity: 0.92; transform: translateY(-1px); }
.quiz-btn:active { transform: translateY(0); }
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }
.quiz-question-continue { margin-top: 12px; }

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

.quiz-continue-wrap { margin-top: 16px; }

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
  .quiz-content { padding: 20px 10px 48px; }
}
  `,document.head.appendChild(o)}function Pe(t){const e=Object.values(t.nodes).filter(s=>s.kind==="step"),i=new Set(e.map(s=>s.id)),n=Object.values(t.nodes).find(s=>s.kind==="start"),o=[];if(n)for(const s of Object.values(t.edges))s.from===n.id&&i.has(s.to)&&o.push(s.to);else for(const s of e)o.push(s.id);const r=new Set,a=[];for(;o.length;){const s=o.shift();if(r.has(s))continue;r.add(s);const _=t.nodes[s];_&&_.kind==="step"&&a.push(_);for(const l of Object.values(t.edges))l.from===s&&i.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const s of e)r.has(s.id)||a.push(s);return a}function ut(t,e){typeof window.fbq=="function"&&window.fbq("track",t,e)}function Ee({data:t,settings:e,config:i}){const[n,o]=T(null),[r,a]=T([]),[s,_]=T(null),[l,c]=T({}),[u,f]=T(0),[d,b]=T(null),y=W(null),q=W(!1);N(()=>{if(!d)return;const h=setTimeout(()=>b(null),4e3);return()=>clearTimeout(h)},[d]);const m=Pe(t),v=m.length;N(()=>{if(q.current)return;q.current=!0;const h=le(t,i.quizId);c(h);const x=de(t);if(!x){console.error("[quiz-runtime] No start node found");return}const w=O(t,x.id,null,null,h);if(o(w),!i.preview&&e.providers.metaPixel?.pixelId&&ut("PageView",{}),i.preview)return;const j=pe();he(i.apiBaseUrl,i.quizId,h,j,t.id??"").then(F=>{_(F),y.current=new fe(F,(Vt,Zt)=>me(i.apiBaseUrl,Vt,Zt)),w&&w.kind==="step"&&y.current.push({event_type:"step_view",step_id:w.id,variant_group_id:w.variantGroupId})}).catch(F=>{console.warn("[quiz-runtime] session start failed:",F)})},[]),N(()=>()=>y.current?.destroy(),[]),N(()=>{if(!n||n.kind!=="step")return;const h=n;if(h.subEls.length===0){const x=O(t,h.id,null,null,l);x&&x.id!==n.id&&S(x,!1)}},[n]);const S=A((h,x=!0)=>{if(x&&n&&a(w=>[...w,n]),o(h),h.kind==="step"){const w=m.findIndex(j=>j.id===h.id);w>=0&&f(w),i.preview||y.current?.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId})}},[n,m,i.preview]),$=A((h,x)=>{if(!n||n.kind!=="step")return;i.preview||y.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:x,meta:{questionElId:h}});const w=O(t,n.id,x,h,l);w&&S(w)},[n,t,l,S]),U=A(()=>{if(!n||n.kind!=="step")return;const h=O(t,n.id,null,null,l);h&&S(h)},[n,t,l,S]),Q=A(()=>{if(!n||n.kind!=="step")return;const h=O(t,n.id,null,null,l);h&&S(h)},[n,t,l,S]),L=A(async h=>{if(!i.preview&&(y.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:h}}),e.providers.metaPixel?.pixelId&&ut("Lead",{content_name:e.metadata.title,value:0}),e.providers.klaviyo?.listId&&s))try{await ve(i.apiBaseUrl,s,h,e.providers.klaviyo.listId)}catch(x){console.warn("[quiz-runtime] Klaviyo subscribe failed:",x)}if(n&&n.kind==="step"){const x=O(t,n.id,null,null,l);x&&S(x)}},[n,t,l,S,s,e,i]),B=A(()=>{i.preview||y.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),a(h=>{if(h.length===0)return h;const x=h[h.length-1],w=h.slice(0,-1);if(o(x),x.kind==="step"){const j=m.findIndex(F=>F.id===x.id);j>=0&&f(j)}return w})},[n,m]),I=A(h=>{if(i.preview){const x=h.redirectUrl||e.redirectUrl||"(no redirect URL)";b(`[Preview] Would redirect to: ${x}`);return}y.current?.push({event_type:"exit_click"}),e.providers.metaPixel?.pixelId&&ut("CompleteRegistration",{content_name:e.metadata.title,value:0}),y.current?.flush().finally(()=>{const x=h.redirectUrl||e.redirectUrl||"",w=new URL(x,location.href);w.searchParams.set("utm_source","quiz"),w.searchParams.set("utm_campaign",document.title||"quiz"),s&&w.searchParams.set("utm_content",s),location.href=w.toString()})},[e,s,i.preview]);if(n?.kind==="exit"){const h=n;return p("div",{class:"quiz-shell",children:[p("div",{class:"quiz-content quiz-exit",children:[p("p",{class:"quiz-text",children:H("loadingResults",i.market)}),p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>I(h),children:H("seeResults",i.market)})]}),d&&p("div",{class:"quiz-preview-toast",children:d})]})}if(!n||n.kind!=="step")return p("div",{class:"quiz-shell",children:p("div",{class:"quiz-content",children:p("div",{class:"quiz-loading",children:p("div",{class:"quiz-loading-spinner"})})})});const P=n,Wt=e.backNavigation&&r.length>0,Qt=e.providers.klaviyo?.captureAtStepId;return p("div",{class:"quiz-shell",children:[p("div",{class:"quiz-header",children:[Wt&&p("button",{class:"quiz-back-btn",type:"button",onClick:B,"aria-label":"Go back",children:"←"}),e.brandLogo?.enabled&&e.brandLogo.url&&p("img",{src:e.brandLogo.url,alt:"Logo",class:"quiz-logo"}),e.stepProgressCount&&p("span",{class:"quiz-step-count",children:[u+1," / ",v]})]}),e.progressBar&&p(Te,{current:u+1,total:v}),p("div",{class:"quiz-content",children:p($e,{node:P,onAnswer:$,onLoadingComplete:U,onEmailSubmit:L,captureAtStepId:Qt,market:i.market,onContinue:Q})})]})}function Ct(){const t=window.__QUIZ_DATA__,e=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!t||!e||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Ce(e);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}ne(p(Ee,{data:t,settings:e,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Ct):Ct();
