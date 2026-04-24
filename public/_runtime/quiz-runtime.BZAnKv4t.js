var nt,x,Et,H,vt,Nt,jt,at,J,G,Lt,_t,lt,dt,tt={},et=[],te=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,rt=Array.isArray;function L(t,e){for(var i in e)t[i]=e[i];return t}function ft(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function ee(t,e,i){var n,o,r,u={};for(r in e)r=="key"?n=e[r]:r=="ref"?o=e[r]:u[r]=e[r];if(arguments.length>2&&(u.children=arguments.length>3?nt.call(arguments,2):i),typeof t=="function"&&t.defaultProps!=null)for(r in t.defaultProps)u[r]===void 0&&(u[r]=t.defaultProps[r]);return K(t,u,n,o,null)}function K(t,e,i,n,o){var r={type:t,props:e,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Et,__i:-1,__u:0};return o==null&&x.vnode!=null&&x.vnode(r),r}function ot(t){return t.children}function Y(t,e){this.props=t,this.context=e}function O(t,e){if(e==null)return t.__?O(t.__,t.__i+1):null;for(var i;e<t.__k.length;e++)if((i=t.__k[e])!=null&&i.__e!=null)return i.__e;return typeof t.type=="function"?O(t):null}function ie(t){if(t.__P&&t.__d){var e=t.__v,i=e.__e,n=[],o=[],r=L({},e);r.__v=e.__v+1,x.vnode&&x.vnode(r),ht(t.__P,r,e,t.__n,t.__P.namespaceURI,32&e.__u?[i]:null,n,i??O(e),!!(32&e.__u),o),r.__v=e.__v,r.__.__k[r.__i]=r,Mt(n,r,o),e.__e=e.__=null,r.__e!=i&&At(r)}}function At(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),At(t)}function xt(t){(!t.__d&&(t.__d=!0)&&H.push(t)&&!it.__r++||vt!=x.debounceRendering)&&((vt=x.debounceRendering)||Nt)(it)}function it(){try{for(var t,e=1;H.length;)H.length>e&&H.sort(jt),t=H.shift(),e=H.length,ie(t)}finally{H.length=it.__r=0}}function Ut(t,e,i,n,o,r,u,a,c,l,f){var s,p,_,z,I,y,m,g=n&&n.__k||et,$=e.length;for(c=ne(i,e,g,c,$),s=0;s<$;s++)(_=i.__k[s])!=null&&(p=_.__i!=-1&&g[_.__i]||tt,_.__i=s,y=ht(t,_,p,o,r,u,a,c,l,f),z=_.__e,_.ref&&p.ref!=_.ref&&(p.ref&&mt(p.ref,null,_),f.push(_.ref,_.__c||z,_)),I==null&&z!=null&&(I=z),(m=!!(4&_.__u))||p.__k===_.__k?(c=Ht(_,c,t,m),m&&p.__e&&(p.__e=null)):typeof _.type=="function"&&y!==void 0?c=y:z&&(c=z.nextSibling),_.__u&=-7);return i.__e=I,c}function ne(t,e,i,n,o){var r,u,a,c,l,f=i.length,s=f,p=0;for(t.__k=new Array(o),r=0;r<o;r++)(u=e[r])!=null&&typeof u!="boolean"&&typeof u!="function"?(typeof u=="string"||typeof u=="number"||typeof u=="bigint"||u.constructor==String?u=t.__k[r]=K(null,u,null,null,null):rt(u)?u=t.__k[r]=K(ot,{children:u},null,null,null):u.constructor===void 0&&u.__b>0?u=t.__k[r]=K(u.type,u.props,u.key,u.ref?u.ref:null,u.__v):t.__k[r]=u,c=r+p,u.__=t,u.__b=t.__b+1,a=null,(l=u.__i=re(u,i,c,s))!=-1&&(s--,(a=i[l])&&(a.__u|=2)),a==null||a.__v==null?(l==-1&&(o>f?p--:o<f&&p++),typeof u.type!="function"&&(u.__u|=4)):l!=c&&(l==c-1?p--:l==c+1?p++:(l>c?p--:p++,u.__u|=4))):t.__k[r]=null;if(s)for(r=0;r<f;r++)(a=i[r])!=null&&(2&a.__u)==0&&(a.__e==n&&(n=O(a)),Ot(a,a));return n}function Ht(t,e,i,n){var o,r;if(typeof t.type=="function"){for(o=t.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=t,e=Ht(o[r],e,i,n));return e}t.__e!=e&&(n&&(e&&t.type&&!e.parentNode&&(e=O(t)),i.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function re(t,e,i,n){var o,r,u,a=t.key,c=t.type,l=e[i],f=l!=null&&(2&l.__u)==0;if(l===null&&a==null||f&&a==l.key&&c==l.type)return i;if(n>(f?1:0)){for(o=i-1,r=i+1;o>=0||r<e.length;)if((l=e[u=o>=0?o--:r++])!=null&&(2&l.__u)==0&&a==l.key&&c==l.type)return u}return-1}function bt(t,e,i){e[0]=="-"?t.setProperty(e,i??""):t[e]=i==null?"":typeof i!="number"||te.test(e)?i:i+"px"}function Z(t,e,i,n,o){var r,u;t:if(e=="style")if(typeof i=="string")t.style.cssText=i;else{if(typeof n=="string"&&(t.style.cssText=n=""),n)for(e in n)i&&e in i||bt(t.style,e,"");if(i)for(e in i)n&&i[e]==n[e]||bt(t.style,e,i[e])}else if(e[0]=="o"&&e[1]=="n")r=e!=(e=e.replace(Lt,"$1")),u=e.toLowerCase(),e=u in t||e=="onFocusOut"||e=="onFocusIn"?u.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+r]=i,i?n?i[G]=n[G]:(i[G]=_t,t.addEventListener(e,r?dt:lt,r)):t.removeEventListener(e,r?dt:lt,r);else{if(o=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=i??"";break t}catch{}typeof i=="function"||(i==null||i===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&i==1?"":i))}}function zt(t){return function(e){if(this.l){var i=this.l[e.type+t];if(e[J]==null)e[J]=_t++;else if(e[J]<i[G])return;return i(x.event?x.event(e):e)}}}function ht(t,e,i,n,o,r,u,a,c,l){var f,s,p,_,z,I,y,m,g,$,E,S,W,M,D,C=e.type;if(e.constructor!==void 0)return null;128&i.__u&&(c=!!(32&i.__u),r=[a=e.__e=i.__e]),(f=x.__b)&&f(e);t:if(typeof C=="function")try{if(m=e.props,g=C.prototype&&C.prototype.render,$=(f=C.contextType)&&n[f.__c],E=f?$?$.props.value:f.__:n,i.__c?y=(s=e.__c=i.__c).__=s.__E:(g?e.__c=s=new C(m,E):(e.__c=s=new Y(m,E),s.constructor=C,s.render=ae),$&&$.sub(s),s.state||(s.state={}),s.__n=n,p=s.__d=!0,s.__h=[],s._sb=[]),g&&s.__s==null&&(s.__s=s.state),g&&C.getDerivedStateFromProps!=null&&(s.__s==s.state&&(s.__s=L({},s.__s)),L(s.__s,C.getDerivedStateFromProps(m,s.__s))),_=s.props,z=s.state,s.__v=e,p)g&&C.getDerivedStateFromProps==null&&s.componentWillMount!=null&&s.componentWillMount(),g&&s.componentDidMount!=null&&s.__h.push(s.componentDidMount);else{if(g&&C.getDerivedStateFromProps==null&&m!==_&&s.componentWillReceiveProps!=null&&s.componentWillReceiveProps(m,E),e.__v==i.__v||!s.__e&&s.shouldComponentUpdate!=null&&s.shouldComponentUpdate(m,s.__s,E)===!1){e.__v!=i.__v&&(s.props=m,s.state=s.__s,s.__d=!1),e.__e=i.__e,e.__k=i.__k,e.__k.some(function(A){A&&(A.__=e)}),et.push.apply(s.__h,s._sb),s._sb=[],s.__h.length&&u.push(s);break t}s.componentWillUpdate!=null&&s.componentWillUpdate(m,s.__s,E),g&&s.componentDidUpdate!=null&&s.__h.push(function(){s.componentDidUpdate(_,z,I)})}if(s.context=E,s.props=m,s.__P=t,s.__e=!1,S=x.__r,W=0,g)s.state=s.__s,s.__d=!1,S&&S(e),f=s.render(s.props,s.state,s.context),et.push.apply(s.__h,s._sb),s._sb=[];else do s.__d=!1,S&&S(e),f=s.render(s.props,s.state,s.context),s.state=s.__s;while(s.__d&&++W<25);s.state=s.__s,s.getChildContext!=null&&(n=L(L({},n),s.getChildContext())),g&&!p&&s.getSnapshotBeforeUpdate!=null&&(I=s.getSnapshotBeforeUpdate(_,z)),M=f!=null&&f.type===ot&&f.key==null?Ft(f.props.children):f,a=Ut(t,rt(M)?M:[M],e,i,n,o,r,u,a,c,l),s.base=e.__e,e.__u&=-161,s.__h.length&&u.push(s),y&&(s.__E=s.__=null)}catch(A){if(e.__v=null,c||r!=null)if(A.then){for(e.__u|=c?160:128;a&&a.nodeType==8&&a.nextSibling;)a=a.nextSibling;r[r.indexOf(a)]=null,e.__e=a}else{for(D=r.length;D--;)ft(r[D]);ct(e)}else e.__e=i.__e,e.__k=i.__k,A.then||ct(e);x.__e(A,e,i)}else r==null&&e.__v==i.__v?(e.__k=i.__k,e.__e=i.__e):a=e.__e=oe(i.__e,e,i,n,o,r,u,c,l);return(f=x.diffed)&&f(e),128&e.__u?void 0:a}function ct(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(ct))}function Mt(t,e,i){for(var n=0;n<i.length;n++)mt(i[n],i[++n],i[++n]);x.__c&&x.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(r){r.call(o)})}catch(r){x.__e(r,o.__v)}})}function Ft(t){return typeof t!="object"||t==null||t.__b>0?t:rt(t)?t.map(Ft):L({},t)}function oe(t,e,i,n,o,r,u,a,c){var l,f,s,p,_,z,I,y=i.props||tt,m=e.props,g=e.type;if(g=="svg"?o="http://www.w3.org/2000/svg":g=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((_=r[l])&&"setAttribute"in _==!!g&&(g?_.localName==g:_.nodeType==3)){t=_,r[l]=null;break}}if(t==null){if(g==null)return document.createTextNode(m);t=document.createElementNS(o,g,m.is&&m),a&&(x.__m&&x.__m(e,r),a=!1),r=null}if(g==null)y===m||a&&t.data==m||(t.data=m);else{if(r=r&&nt.call(t.childNodes),!a&&r!=null)for(y={},l=0;l<t.attributes.length;l++)y[(_=t.attributes[l]).name]=_.value;for(l in y)_=y[l],l=="dangerouslySetInnerHTML"?s=_:l=="children"||l in m||l=="value"&&"defaultValue"in m||l=="checked"&&"defaultChecked"in m||Z(t,l,null,_,o);for(l in m)_=m[l],l=="children"?p=_:l=="dangerouslySetInnerHTML"?f=_:l=="value"?z=_:l=="checked"?I=_:a&&typeof _!="function"||y[l]===_||Z(t,l,_,y[l],o);if(f)a||s&&(f.__html==s.__html||f.__html==t.innerHTML)||(t.innerHTML=f.__html),e.__k=[];else if(s&&(t.innerHTML=""),Ut(e.type=="template"?t.content:t,rt(p)?p:[p],e,i,n,g=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,u,r?r[0]:i.__k&&O(i,0),a,c),r!=null)for(l=r.length;l--;)ft(r[l]);a||(l="value",g=="progress"&&z==null?t.removeAttribute("value"):z!=null&&(z!==t[l]||g=="progress"&&!z||g=="option"&&z!=y[l])&&Z(t,l,z,y[l],o),l="checked",I!=null&&I!=t[l]&&Z(t,l,I,y[l],o))}return t}function mt(t,e,i){try{if(typeof t=="function"){var n=typeof t.__u=="function";n&&t.__u(),n&&e==null||(t.__u=t(e))}else t.current=e}catch(o){x.__e(o,i)}}function Ot(t,e,i){var n,o;if(x.unmount&&x.unmount(t),(n=t.ref)&&(n.current&&n.current!=t.__e||mt(n,null,e)),(n=t.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){x.__e(r,e)}n.base=n.__P=null}if(n=t.__k)for(o=0;o<n.length;o++)n[o]&&Ot(n[o],e,i||typeof t.type!="function");i||ft(t.__e),t.__c=t.__=t.__e=void 0}function ae(t,e,i){return this.constructor(t,i)}function se(t,e,i){var n,o,r,u;e==document&&(e=document.documentElement),x.__&&x.__(t,e),o=(n=!1)?null:e.__k,r=[],u=[],ht(e,t=e.__k=ee(ot,null,[t]),o||tt,tt,e.namespaceURI,o?null:e.firstChild?nt.call(e.childNodes):null,r,o?o.__e:e.firstChild,n,u),Mt(r,t,u)}nt=et.slice,x={__e:function(t,e,i,n){for(var o,r,u;e=e.__;)if((o=e.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(t)),u=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,n||{}),u=o.__d),u)return o.__E=o}catch(a){t=a}throw t}},Et=0,Y.prototype.setState=function(t,e){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=L({},this.state),typeof t=="function"&&(t=t(L({},i),this.props)),t&&L(i,t),t!=null&&this.__v&&(e&&this._sb.push(e),xt(this))},Y.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),xt(this))},Y.prototype.render=ot,H=[],Nt=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,jt=function(t,e){return t.__v.__b-e.__v.__b},it.__r=0,at=Math.random().toString(8),J="__d"+at,G="__a"+at,Lt=/(PointerCapture)$|Capture$/i,_t=0,lt=zt(!1),dt=zt(!0);var ue=0;function d(t,e,i,n,o,r){e||(e={});var u,a,c=e;if("ref"in c)for(a in c={},e)a=="ref"?u=e[a]:c[a]=e[a];var l={type:t,props:c,key:i,ref:u,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ue,__i:-1,__u:0,__source:o,__self:r};if(typeof t=="function"&&(u=t.defaultProps))for(a in u)c[a]===void 0&&(c[a]=u[a]);return x.vnode&&x.vnode(l),l}var V,q,st,qt,Q=0,Bt=[],w=x,yt=w.__b,wt=w.__r,kt=w.diffed,St=w.__c,$t=w.unmount,It=w.__;function gt(t,e){w.__h&&w.__h(q,t,Q||e),Q=0;var i=q.__H||(q.__H={__:[],__h:[]});return t>=i.__.length&&i.__.push({}),i.__[t]}function k(t){return Q=1,le(Gt,t)}function le(t,e,i){var n=gt(V++,2);if(n.t=t,!n.__c&&(n.__=[Gt(void 0,e),function(a){var c=n.__N?n.__N[0]:n.__[0],l=n.t(c,a);c!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=q,!q.__f)){var o=function(a,c,l){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(p){return p.__c});if(f.every(function(p){return!p.__N}))return!r||r.call(this,a,c,l);var s=n.__c.props!==a;return f.some(function(p){if(p.__N){var _=p.__[0];p.__=p.__N,p.__N=void 0,_!==p.__[0]&&(s=!0)}}),r&&r.call(this,a,c,l)||s};q.__f=!0;var r=q.shouldComponentUpdate,u=q.componentWillUpdate;q.componentWillUpdate=function(a,c,l){if(this.__e){var f=r;r=void 0,o(a,c,l),r=f}u&&u.call(this,a,c,l)},q.shouldComponentUpdate=o}return n.__N||n.__}function P(t,e){var i=gt(V++,3);!w.__s&&Rt(i.__H,e)&&(i.__=t,i.u=e,q.__H.__h.push(i))}function B(t){return Q=5,Dt(function(){return{current:t}},[])}function Dt(t,e){var i=gt(V++,7);return Rt(i.__H,e)&&(i.__=t(),i.__H=e,i.__h=t),i.__}function U(t,e){return Q=8,Dt(function(){return t},e)}function de(){for(var t;t=Bt.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(X),e.__h.some(pt),e.__h=[]}catch(i){e.__h=[],w.__e(i,t.__v)}}}w.__b=function(t){q=null,yt&&yt(t)},w.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),It&&It(t,e)},w.__r=function(t){wt&&wt(t),V=0;var e=(q=t.__c).__H;e&&(st===q?(e.__h=[],q.__h=[],e.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(e.__h.some(X),e.__h.some(pt),e.__h=[],V=0)),st=q},w.diffed=function(t){kt&&kt(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Bt.push(e)!==1&&qt===w.requestAnimationFrame||((qt=w.requestAnimationFrame)||ce)(de)),e.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),st=q=null},w.__c=function(t,e){e.some(function(i){try{i.__h.some(X),i.__h=i.__h.filter(function(n){return!n.__||pt(n)})}catch(n){e.some(function(o){o.__h&&(o.__h=[])}),e=[],w.__e(n,i.__v)}}),St&&St(t,e)},w.unmount=function(t){$t&&$t(t);var e,i=t.__c;i&&i.__H&&(i.__H.__.some(function(n){try{X(n)}catch(o){e=o}}),i.__H=void 0,e&&w.__e(e,i.__v))};var Ct=typeof requestAnimationFrame=="function";function ce(t){var e,i=function(){clearTimeout(n),Ct&&cancelAnimationFrame(e),setTimeout(t)},n=setTimeout(i,35);Ct&&(e=requestAnimationFrame(i))}function X(t){var e=q,i=t.__c;typeof i=="function"&&(t.__c=void 0,i()),q=e}function pt(t){var e=q;t.__c=t.__(),q=e}function Rt(t,e){return!t||t.length!==e.length||e.some(function(i,n){return i!==t[n]})}function Gt(t,e){return typeof e=="function"?e(t):e}function pe(t){const e=t.reduce((n,o)=>n+(o.trafficPct??0),0);if(e<=0)return t[0];let i=Math.random()*e;for(const n of t)if(i-=n.trafficPct??0,i<=0)return n;return t[t.length-1]}function _e(t,e){const i={};for(const o of Object.values(t.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const u=`quiz_${e}_vg_${o}`,a=localStorage.getItem(u);if(a&&t.nodes[a])n[o]=a;else{const c=pe(r);localStorage.setItem(u,c.id),n[o]=c.id}}return n}function fe(t,e){return Object.values(t.edges).filter(i=>i.from===e)}function he(t,e,i){return!t||t.kind==="default"?!1:t.kind==="option"?t.optionId===e&&t.questionElId===i:!1}function F(t,e,i,n,o){const r=fe(t,e);if(r.length===0)return null;if(i!==null){const a=r.find(c=>he(c.condition,i,n));if(a)return Tt(t,a.to,o)}const u=r.find(a=>!a.condition||a.condition.kind==="default")??r[0];return Tt(t,u.to,o)}function Tt(t,e,i){const n=t.nodes[e];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return t.nodes[o]??n}return n}function me(t){return Object.values(t.nodes).find(e=>e.kind==="start")??null}function ge(){const t=new URLSearchParams(location.search),e={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=t.get(n);o&&(e[n]=o)}return e}class ve{constructor(e,i){this.sessionId=e,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(e){this.buf.push({...e,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const e=this.buf.splice(0);try{await this.flushFn(this.sessionId,e)}catch{this.buf.unshift(...e)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function xe(t,e,i,n,o){const r=await fetch(`${t}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:e,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function be(t,e,i){const n={session_id:e,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${t}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function ze(t,e,i,n){const o=await fetch(`${t}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:e,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const qe={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function N(t,e){const i=e??"en",n=qe[t];return i in n?n[i]:n.en}function Vt(t){if(!t)return;const e=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))e(o)};for(const i of Array.from(t.children))e(i)}function ye(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Qt(t,e){return!e||!t.includes("{")?t:t.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{const o=e[n];return o==null?i:ye(o)})}function we({el:t,variables:e}){const i=B(null),n=Qt(t.text,e);return P(()=>{i.current&&(i.current.innerHTML=n,Vt(i.current))},[n]),d("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":t.id,class:"quiz-title"})}function ke({el:t,variables:e}){const i=B(null),n=Qt(t.text,e);return P(()=>{i.current&&(i.current.innerHTML=n,Vt(i.current))},[n]),d("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":t.id,class:"quiz-text"})}function Se({el:t}){return d("img",{"data-quiz-el":"image","data-quiz-el-id":t.id,src:t.url,alt:t.alt,class:"quiz-image"})}function $e({el:t,variables:e,onVariableChange:i}){const[n,o]=k(e?.[t.variable]??"");P(()=>{i?.(t.variable,n)},[n,t.variable,i]);const r=t.inputType==="number"?"number":t.inputType==="date"?"date":"text";return d("input",{type:r,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":t.id,placeholder:t.placeholder,value:n,min:t.min,max:t.max,onInput:u=>o(u.target.value)})}function Ie({el:t,variables:e,onVariableChange:i}){const[n,o]=k(Number(e?.[t.variable]??t.initial??Math.round((t.min+t.max)/2)));P(()=>{i?.(t.variable,String(n))},[n,t.variable,i]);const r=t.unit??"",u=(n-t.min)/(t.max-t.min)*100;return d("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":t.id,children:[d("div",{class:"quiz-range-value",children:[n,r&&` ${r}`]}),d("input",{type:"range",class:"quiz-range-input",min:t.min,max:t.max,step:t.step??1,value:n,style:`--quiz-range-pct: ${u}%`,onInput:a=>o(Number(a.target.value))}),d("div",{class:"quiz-range-bounds",children:[d("span",{children:[t.min,r&&` ${r}`]}),d("span",{children:[t.max,r&&` ${r}`]})]})]})}function Ce({el:t}){const[e,i]=k(0),n=t.items.length;if(n===0)return null;const o=t.items[e],r=()=>i(a=>(a+1)%n),u=()=>i(a=>(a-1+n)%n);return d("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":t.id,children:[d("div",{class:"quiz-testimonial-card",children:[o.avatar&&d("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),d("div",{class:"quiz-testimonial-body",children:[d("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&d("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),d("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),d("div",{class:"quiz-testimonial-text",children:o.text})]})]}),n>1&&d("div",{class:"quiz-testimonial-nav",children:[d("button",{type:"button",class:"quiz-testimonial-prev",onClick:u,"aria-label":"Previous",children:"←"}),d("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(a,c)=>d("button",{type:"button",class:`quiz-testimonial-dot${c===e?" quiz-testimonial-dot--active":""}`,onClick:()=>i(c),"aria-label":`Go to testimonial ${c+1}`},c))}),d("button",{type:"button",class:"quiz-testimonial-next",onClick:r,"aria-label":"Next",children:"→"})]})]})}function Te(t){const e=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of e)for(const n of Array.from(t.querySelectorAll(i)))n.parentNode?.removeChild(n);t.innerText.trim().length===0&&(t.style.display="none")}function Pe({el:t}){const e=B(null);return P(()=>{e.current&&(e.current.innerHTML=t.html,Te(e.current))},[t.html]),d("div",{ref:e,"data-quiz-el":"custom_html","data-quiz-el-id":t.id,class:"quiz-custom-html"})}function Ee({el:t,onComplete:e}){return P(()=>{const i=setTimeout(e,t.seconds*1e3);return()=>clearTimeout(i)},[t.seconds,e]),d("div",{"data-quiz-el":"loading","data-quiz-el-id":t.id,class:"quiz-loading",children:[d("div",{class:"quiz-loading-spinner"}),t.text&&d("p",{class:"quiz-loading-text",children:t.text})]})}function Ne({option:t,layout:e,selected:i,onClick:n}){const o=["quiz-option",`quiz-option--${e}`,i?"quiz-option--selected":""].filter(Boolean).join(" ");return d("button",{class:o,"data-quiz-opt-id":t.id,onClick:n,type:"button",children:[e==="image_cards"&&t.imageUrl&&d("img",{src:t.imageUrl,alt:t.label,class:"quiz-option-img"}),t.emoji&&d("span",{class:"quiz-option-emoji",children:t.emoji}),d("span",{class:"quiz-option-label",children:t.label})]})}function je({el:t,onAnswer:e,market:i}){const[n,o]=k(new Set),r=u=>{t.kindOf==="single"?(o(new Set([u])),setTimeout(()=>e(t.id,u),200)):o(a=>{const c=new Set(a);return c.has(u)?c.delete(u):c.add(u),c})};return t.layout==="dropdown"?d(Le,{el:t,onPick:u=>r(u),market:i}):d("div",{"data-quiz-el":"question","data-quiz-el-id":t.id,class:`quiz-question quiz-question--${t.layout}`,children:[t.options.map(u=>d(Ne,{option:u,layout:t.layout,selected:n.has(u.id),onClick:()=>r(u.id)},u.id)),t.kindOf==="multi"&&n.size>0&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const u=[...n][0];e(t.id,u)},children:N("continue",i)})]})}function Le({el:t,onPick:e,market:i}){const[n,o]=k(!1),[r,u]=k(""),[a,c]=k(null),l=B(null);P(()=>{if(!n)return;const _=z=>{l.current&&!l.current.contains(z.target)&&o(!1)};return document.addEventListener("mousedown",_),()=>document.removeEventListener("mousedown",_)},[n]);const f=r.trim().toLowerCase(),s=f?t.options.filter(_=>_.label.toLowerCase().includes(f)):t.options,p=t.dropdownPlaceholder||(t.searchable?N("searchPlaceholder",i):N("selectPlaceholder",i));return d("div",{class:`quiz-dropdown${n?" quiz-dropdown--open":""}`,"data-quiz-el":"question","data-quiz-el-id":t.id,ref:l,children:[d("button",{type:"button",class:"quiz-dropdown-trigger",onClick:()=>o(_=>!_),"aria-expanded":n,children:[d("span",{class:a?"":"quiz-dropdown-placeholder",children:a??p}),d("span",{class:"quiz-dropdown-chevron","aria-hidden":"true",children:"▾"})]}),n&&d("div",{class:"quiz-dropdown-panel",children:[t.searchable&&d("input",{type:"text",class:"quiz-dropdown-search",placeholder:p,value:r,autoFocus:!0,onInput:_=>u(_.target.value)}),d("ul",{class:"quiz-dropdown-list",children:[s.length===0&&d("li",{class:"quiz-dropdown-empty",children:N("noMatches",i)}),s.map(_=>d("li",{children:d("button",{type:"button",class:"quiz-dropdown-item","data-quiz-opt-id":_.id,onClick:()=>{c(_.label),o(!1),u(""),e(_.id)},children:[_.emoji&&d("span",{class:"quiz-dropdown-emoji",children:_.emoji}),_.label]})},_.id))]})]})]})}function Ae({onSubmit:t,market:e}){const[i,n]=k(""),[o,r]=k("");return d("form",{class:"quiz-email-form",onSubmit:a=>{if(a.preventDefault(),!i.includes("@")){r(N("invalidEmail",e));return}r(""),t(i)},novalidate:!0,children:[d("input",{type:"email",class:"quiz-email-input",placeholder:N("emailPlaceholder",e),value:i,onInput:a=>n(a.target.value),required:!0}),o&&d("p",{class:"quiz-email-error",children:o}),d("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:N("continue",e)})]})}function Ue({node:t,onAnswer:e,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:u,variables:a,onVariableChange:c}){const l=t.subEls.some(p=>p.kind==="question"),f=t.subEls.some(p=>p.kind==="loading"),s=!l&&!f&&typeof u=="function";return d("div",{class:"quiz-step","data-step-id":t.id,children:[t.subEls.map(p=>{switch(p.kind){case"title":return d(we,{el:p,variables:a},p.id);case"text":return d(ke,{el:p,variables:a},p.id);case"image":return d(Se,{el:p},p.id);case"custom_html":return d(Pe,{el:p},p.id);case"loading":return d(Ee,{el:p,onComplete:i},p.id);case"question":return d(je,{el:p,onAnswer:e,market:r},p.id);case"text_input":return d($e,{el:p,variables:a,onVariableChange:c},p.id);case"range_slider":return d(Ie,{el:p,variables:a,onVariableChange:c},p.id);case"testimonial_slider":return d(Ce,{el:p},p.id)}}),o===t.id&&d(Ae,{onSubmit:n,market:r}),s&&d("div",{class:"quiz-continue-wrap",children:d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:u,children:N("continue",r)})})]})}function He({current:t,total:e}){const i=e>0?Math.round(t/e*100):0;return d("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:d("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Me(t){const{brandColors:e,fontSettings:i}=t,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
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

.quiz-dropdown { position: relative; width: 100%; }
.quiz-dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
  padding: 14px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
}
.quiz-dropdown--open .quiz-dropdown-trigger { border-color: var(--quiz-brand); }
.quiz-dropdown-placeholder { color: rgba(0,0,0,0.45); }
.quiz-dropdown-chevron { opacity: 0.5; transition: transform 0.2s; }
.quiz-dropdown--open .quiz-dropdown-chevron { transform: rotate(180deg); }
.quiz-dropdown-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1.5px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.12);
  max-height: 320px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.quiz-dropdown-search {
  border: none;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding: 12px 14px;
  font-size: 15px;
  font-family: var(--quiz-font);
  outline: none;
  width: 100%;
}
.quiz-dropdown-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
  overflow-y: auto;
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
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
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
  .quiz-content { padding: 20px 10px 48px; }
}
  `,document.head.appendChild(o)}function Fe(t){const e=Object.values(t.nodes).filter(a=>a.kind==="step"),i=new Set(e.map(a=>a.id)),n=Object.values(t.nodes).find(a=>a.kind==="start"),o=[];if(n)for(const a of Object.values(t.edges))a.from===n.id&&i.has(a.to)&&o.push(a.to);else for(const a of e)o.push(a.id);const r=new Set,u=[];for(;o.length;){const a=o.shift();if(r.has(a))continue;r.add(a);const c=t.nodes[a];c&&c.kind==="step"&&u.push(c);for(const l of Object.values(t.edges))l.from===a&&i.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const a of e)r.has(a.id)||u.push(a);return u}function ut(t,e){typeof window.fbq=="function"&&window.fbq("track",t,e)}function Oe({data:t,settings:e,config:i}){const[n,o]=k(null),[r,u]=k([]),[a,c]=k(null),[l,f]=k({}),[s,p]=k(0),[_,z]=k(null),[I,y]=k({}),m=B(null),g=B(!1);P(()=>{if(!_)return;const h=setTimeout(()=>z(null),4e3);return()=>clearTimeout(h)},[_]);const $=Fe(t),E=$.length;P(()=>{if(g.current)return;g.current=!0;const h=_e(t,i.quizId);f(h);const v=me(t);if(!v){console.error("[quiz-runtime] No start node found");return}const b=F(t,v.id,null,null,h);if(o(b),!i.preview&&e.providers.metaPixel?.pixelId&&ut("PageView",{}),i.preview)return;const j=ge();xe(i.apiBaseUrl,i.quizId,h,j,t.id??"").then(T=>{c(T),m.current=new ve(T,(R,Xt)=>be(i.apiBaseUrl,R,Xt)),b&&b.kind==="step"&&m.current.push({event_type:"step_view",step_id:b.id,variant_group_id:b.variantGroupId})}).catch(T=>{console.warn("[quiz-runtime] session start failed:",T)})},[]),P(()=>()=>m.current?.destroy(),[]),P(()=>{if(!n||n.kind!=="step")return;const h=n;if(h.subEls.length===0){const v=F(t,h.id,null,null,l);v&&v.id!==n.id&&S(v,!1)}},[n]);const S=U((h,v=!0)=>{if(v&&n&&u(b=>[...b,n]),o(h),h.kind==="step"){const b=$.findIndex(j=>j.id===h.id);b>=0&&p(b),i.preview||m.current?.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId})}},[n,$,i.preview]),W=U((h,v)=>{if(!n||n.kind!=="step")return;const b=n.subEls.find(T=>T.id===h&&T.kind==="question");if(b&&b.kind==="question"&&b.variable){const T=b.options.find(R=>R.id===v);T&&y(R=>({...R,[b.variable]:T.label}))}i.preview||m.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:v,meta:{questionElId:h}});const j=F(t,n.id,v,h,l);j&&S(j)},[n,t,l,S]),M=U((h,v)=>{y(b=>({...b,[h]:v}))},[]),D=U(()=>{if(!n||n.kind!=="step")return;const h=F(t,n.id,null,null,l);h&&S(h)},[n,t,l,S]),C=U(()=>{if(!n||n.kind!=="step")return;const h=F(t,n.id,null,null,l);h&&S(h)},[n,t,l,S]),A=U(async h=>{if(!i.preview&&(m.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:h}}),e.providers.metaPixel?.pixelId&&ut("Lead",{content_name:e.metadata.title,value:0}),e.providers.klaviyo?.listId&&a))try{await ze(i.apiBaseUrl,a,h,e.providers.klaviyo.listId)}catch(v){console.warn("[quiz-runtime] Klaviyo subscribe failed:",v)}if(n&&n.kind==="step"){const v=F(t,n.id,null,null,l);v&&S(v)}},[n,t,l,S,a,e,i]),Wt=U(()=>{i.preview||m.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),u(h=>{if(h.length===0)return h;const v=h[h.length-1],b=h.slice(0,-1);if(o(v),v.kind==="step"){const j=$.findIndex(T=>T.id===v.id);j>=0&&p(j)}return b})},[n,$]),Zt=U(h=>{if(i.preview){const v=h.redirectUrl||e.redirectUrl||"(no redirect URL)";z(`[Preview] Would redirect to: ${v}`);return}m.current?.push({event_type:"exit_click"}),e.providers.metaPixel?.pixelId&&ut("CompleteRegistration",{content_name:e.metadata.title,value:0}),m.current?.flush().finally(()=>{const v=h.redirectUrl||e.redirectUrl||"",b=new URL(v,location.href);b.searchParams.set("utm_source","quiz"),b.searchParams.set("utm_campaign",document.title||"quiz"),a&&b.searchParams.set("utm_content",a),location.href=b.toString()})},[e,a,i.preview]);if(n?.kind==="exit"){const h=n;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-content quiz-exit",children:[d("p",{class:"quiz-text",children:N("loadingResults",i.market)}),d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>Zt(h),children:N("seeResults",i.market)})]}),_&&d("div",{class:"quiz-preview-toast",children:_})]})}if(!n||n.kind!=="step")return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content",children:d("div",{class:"quiz-loading",children:d("div",{class:"quiz-loading-spinner"})})})});const Jt=n,Kt=e.backNavigation&&r.length>0,Yt=e.providers.klaviyo?.captureAtStepId;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-header",children:[Kt&&d("button",{class:"quiz-back-btn",type:"button",onClick:Wt,"aria-label":"Go back",children:"←"}),e.brandLogo?.enabled&&e.brandLogo.url&&d("img",{src:e.brandLogo.url,alt:"Logo",class:"quiz-logo"}),e.stepProgressCount&&d("span",{class:"quiz-step-count",children:[s+1," / ",E]})]}),e.progressBar&&d(He,{current:s+1,total:E}),d("div",{class:"quiz-content",children:d(Ue,{node:Jt,onAnswer:W,onLoadingComplete:D,onEmailSubmit:A,captureAtStepId:Yt,market:i.market,onContinue:C,variables:I,onVariableChange:M})})]})}function Pt(){const t=window.__QUIZ_DATA__,e=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!t||!e||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Me(e);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}se(d(Oe,{data:t,settings:e,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Pt):Pt();
