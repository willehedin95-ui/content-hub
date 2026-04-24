var ee,g,Ce,T,he,Te,Pe,ie,Q,F,Ne,le,se,_e,K={},X=[],Re=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,te=Array.isArray;function C(t,e){for(var n in e)t[n]=e[n];return t}function ce(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function We(t,e,n){var r,o,i,u={};for(i in e)i=="key"?r=e[i]:i=="ref"?o=e[i]:u[i]=e[i];if(arguments.length>2&&(u.children=arguments.length>3?ee.call(arguments,2):n),typeof t=="function"&&t.defaultProps!=null)for(i in t.defaultProps)u[i]===void 0&&(u[i]=t.defaultProps[i]);return Z(t,u,r,o,null)}function Z(t,e,n,r,o){var i={type:t,props:e,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Ce,__i:-1,__u:0};return o==null&&g.vnode!=null&&g.vnode(i),i}function ne(t){return t.children}function V(t,e){this.props=t,this.context=e}function L(t,e){if(e==null)return t.__?L(t.__,t.__i+1):null;for(var n;e<t.__k.length;e++)if((n=t.__k[e])!=null&&n.__e!=null)return n.__e;return typeof t.type=="function"?L(t):null}function Qe(t){if(t.__P&&t.__d){var e=t.__v,n=e.__e,r=[],o=[],i=C({},e);i.__v=e.__v+1,g.vnode&&g.vnode(i),de(t.__P,i,e,t.__n,t.__P.namespaceURI,32&e.__u?[n]:null,r,n??L(e),!!(32&e.__u),o),i.__v=e.__v,i.__.__k[i.__i]=i,je(r,i,o),e.__e=e.__=null,i.__e!=n&&Ee(i)}}function Ee(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),Ee(t)}function me(t){(!t.__d&&(t.__d=!0)&&T.push(t)&&!Y.__r++||he!=g.debounceRendering)&&((he=g.debounceRendering)||Te)(Y)}function Y(){try{for(var t,e=1;T.length;)T.length>e&&T.sort(Pe),t=T.shift(),e=T.length,Qe(t)}finally{T.length=Y.__r=0}}function Ue(t,e,n,r,o,i,u,_,l,a,p){var s,f,c,y,w,x,m,v=r&&r.__k||X,I=e.length;for(l=Ze(n,e,v,l,I),s=0;s<I;s++)(c=n.__k[s])!=null&&(f=c.__i!=-1&&v[c.__i]||K,c.__i=s,x=de(t,c,f,o,i,u,_,l,a,p),y=c.__e,c.ref&&f.ref!=c.ref&&(f.ref&&pe(f.ref,null,c),p.push(c.ref,c.__c||y,c)),w==null&&y!=null&&(w=y),(m=!!(4&c.__u))||f.__k===c.__k?(l=He(c,l,t,m),m&&f.__e&&(f.__e=null)):typeof c.type=="function"&&x!==void 0?l=x:y&&(l=y.nextSibling),c.__u&=-7);return n.__e=w,l}function Ze(t,e,n,r,o){var i,u,_,l,a,p=n.length,s=p,f=0;for(t.__k=new Array(o),i=0;i<o;i++)(u=e[i])!=null&&typeof u!="boolean"&&typeof u!="function"?(typeof u=="string"||typeof u=="number"||typeof u=="bigint"||u.constructor==String?u=t.__k[i]=Z(null,u,null,null,null):te(u)?u=t.__k[i]=Z(ne,{children:u},null,null,null):u.constructor===void 0&&u.__b>0?u=t.__k[i]=Z(u.type,u.props,u.key,u.ref?u.ref:null,u.__v):t.__k[i]=u,l=i+f,u.__=t,u.__b=t.__b+1,_=null,(a=u.__i=Ve(u,n,l,s))!=-1&&(s--,(_=n[a])&&(_.__u|=2)),_==null||_.__v==null?(a==-1&&(o>p?f--:o<p&&f++),typeof u.type!="function"&&(u.__u|=4)):a!=l&&(a==l-1?f--:a==l+1?f++:(a>l?f--:f++,u.__u|=4))):t.__k[i]=null;if(s)for(i=0;i<p;i++)(_=n[i])!=null&&(2&_.__u)==0&&(_.__e==r&&(r=L(_)),Oe(_,_));return r}function He(t,e,n,r){var o,i;if(typeof t.type=="function"){for(o=t.__k,i=0;o&&i<o.length;i++)o[i]&&(o[i].__=t,e=He(o[i],e,n,r));return e}t.__e!=e&&(r&&(e&&t.type&&!e.parentNode&&(e=L(t)),n.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function Ve(t,e,n,r){var o,i,u,_=t.key,l=t.type,a=e[n],p=a!=null&&(2&a.__u)==0;if(a===null&&_==null||p&&_==a.key&&l==a.type)return n;if(r>(p?1:0)){for(o=n-1,i=n+1;o>=0||i<e.length;)if((a=e[u=o>=0?o--:i++])!=null&&(2&a.__u)==0&&_==a.key&&l==a.type)return u}return-1}function ve(t,e,n){e[0]=="-"?t.setProperty(e,n??""):t[e]=n==null?"":typeof n!="number"||Re.test(e)?n:n+"px"}function R(t,e,n,r,o){var i,u;e:if(e=="style")if(typeof n=="string")t.style.cssText=n;else{if(typeof r=="string"&&(t.style.cssText=r=""),r)for(e in r)n&&e in n||ve(t.style,e,"");if(n)for(e in n)r&&n[e]==r[e]||ve(t.style,e,n[e])}else if(e[0]=="o"&&e[1]=="n")i=e!=(e=e.replace(Ne,"$1")),u=e.toLowerCase(),e=u in t||e=="onFocusOut"||e=="onFocusIn"?u.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+i]=n,n?r?n[F]=r[F]:(n[F]=le,t.addEventListener(e,i?_e:se,i)):t.removeEventListener(e,i?_e:se,i);else{if(o=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&n==1?"":n))}}function ge(t){return function(e){if(this.l){var n=this.l[e.type+t];if(e[Q]==null)e[Q]=le++;else if(e[Q]<n[F])return;return n(g.event?g.event(e):e)}}}function de(t,e,n,r,o,i,u,_,l,a){var p,s,f,c,y,w,x,m,v,I,$,N,G,E,A,S=e.type;if(e.constructor!==void 0)return null;128&n.__u&&(l=!!(32&n.__u),i=[_=e.__e=n.__e]),(p=g.__b)&&p(e);e:if(typeof S=="function")try{if(m=e.props,v=S.prototype&&S.prototype.render,I=(p=S.contextType)&&r[p.__c],$=p?I?I.props.value:p.__:r,n.__c?x=(s=e.__c=n.__c).__=s.__E:(v?e.__c=s=new S(m,$):(e.__c=s=new V(m,$),s.constructor=S,s.render=Ke),I&&I.sub(s),s.state||(s.state={}),s.__n=r,f=s.__d=!0,s.__h=[],s._sb=[]),v&&s.__s==null&&(s.__s=s.state),v&&S.getDerivedStateFromProps!=null&&(s.__s==s.state&&(s.__s=C({},s.__s)),C(s.__s,S.getDerivedStateFromProps(m,s.__s))),c=s.props,y=s.state,s.__v=e,f)v&&S.getDerivedStateFromProps==null&&s.componentWillMount!=null&&s.componentWillMount(),v&&s.componentDidMount!=null&&s.__h.push(s.componentDidMount);else{if(v&&S.getDerivedStateFromProps==null&&m!==c&&s.componentWillReceiveProps!=null&&s.componentWillReceiveProps(m,$),e.__v==n.__v||!s.__e&&s.shouldComponentUpdate!=null&&s.shouldComponentUpdate(m,s.__s,$)===!1){e.__v!=n.__v&&(s.props=m,s.state=s.__s,s.__d=!1),e.__e=n.__e,e.__k=n.__k,e.__k.some(function(h){h&&(h.__=e)}),X.push.apply(s.__h,s._sb),s._sb=[],s.__h.length&&u.push(s);break e}s.componentWillUpdate!=null&&s.componentWillUpdate(m,s.__s,$),v&&s.componentDidUpdate!=null&&s.__h.push(function(){s.componentDidUpdate(c,y,w)})}if(s.context=$,s.props=m,s.__P=t,s.__e=!1,N=g.__r,G=0,v)s.state=s.__s,s.__d=!1,N&&N(e),p=s.render(s.props,s.state,s.context),X.push.apply(s.__h,s._sb),s._sb=[];else do s.__d=!1,N&&N(e),p=s.render(s.props,s.state,s.context),s.state=s.__s;while(s.__d&&++G<25);s.state=s.__s,s.getChildContext!=null&&(r=C(C({},r),s.getChildContext())),v&&!f&&s.getSnapshotBeforeUpdate!=null&&(w=s.getSnapshotBeforeUpdate(c,y)),E=p!=null&&p.type===ne&&p.key==null?Le(p.props.children):p,_=Ue(t,te(E)?E:[E],e,n,r,o,i,u,_,l,a),s.base=e.__e,e.__u&=-161,s.__h.length&&u.push(s),x&&(s.__E=s.__=null)}catch(h){if(e.__v=null,l||i!=null)if(h.then){for(e.__u|=l?160:128;_&&_.nodeType==8&&_.nextSibling;)_=_.nextSibling;i[i.indexOf(_)]=null,e.__e=_}else{for(A=i.length;A--;)ce(i[A]);ue(e)}else e.__e=n.__e,e.__k=n.__k,h.then||ue(e);g.__e(h,e,n)}else i==null&&e.__v==n.__v?(e.__k=n.__k,e.__e=n.__e):_=e.__e=Je(n.__e,e,n,r,o,i,u,l,a);return(p=g.diffed)&&p(e),128&e.__u?void 0:_}function ue(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(ue))}function je(t,e,n){for(var r=0;r<n.length;r++)pe(n[r],n[++r],n[++r]);g.__c&&g.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(i){i.call(o)})}catch(i){g.__e(i,o.__v)}})}function Le(t){return typeof t!="object"||t==null||t.__b>0?t:te(t)?t.map(Le):C({},t)}function Je(t,e,n,r,o,i,u,_,l){var a,p,s,f,c,y,w,x=n.props||K,m=e.props,v=e.type;if(v=="svg"?o="http://www.w3.org/2000/svg":v=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),i!=null){for(a=0;a<i.length;a++)if((c=i[a])&&"setAttribute"in c==!!v&&(v?c.localName==v:c.nodeType==3)){t=c,i[a]=null;break}}if(t==null){if(v==null)return document.createTextNode(m);t=document.createElementNS(o,v,m.is&&m),_&&(g.__m&&g.__m(e,i),_=!1),i=null}if(v==null)x===m||_&&t.data==m||(t.data=m);else{if(i=i&&ee.call(t.childNodes),!_&&i!=null)for(x={},a=0;a<t.attributes.length;a++)x[(c=t.attributes[a]).name]=c.value;for(a in x)c=x[a],a=="dangerouslySetInnerHTML"?s=c:a=="children"||a in m||a=="value"&&"defaultValue"in m||a=="checked"&&"defaultChecked"in m||R(t,a,null,c,o);for(a in m)c=m[a],a=="children"?f=c:a=="dangerouslySetInnerHTML"?p=c:a=="value"?y=c:a=="checked"?w=c:_&&typeof c!="function"||x[a]===c||R(t,a,c,x[a],o);if(p)_||s&&(p.__html==s.__html||p.__html==t.innerHTML)||(t.innerHTML=p.__html),e.__k=[];else if(s&&(t.innerHTML=""),Ue(e.type=="template"?t.content:t,te(f)?f:[f],e,n,r,v=="foreignObject"?"http://www.w3.org/1999/xhtml":o,i,u,i?i[0]:n.__k&&L(n,0),_,l),i!=null)for(a=i.length;a--;)ce(i[a]);_||(a="value",v=="progress"&&y==null?t.removeAttribute("value"):y!=null&&(y!==t[a]||v=="progress"&&!y||v=="option"&&y!=x[a])&&R(t,a,y,x[a],o),a="checked",w!=null&&w!=t[a]&&R(t,a,w,x[a],o))}return t}function pe(t,e,n){try{if(typeof t=="function"){var r=typeof t.__u=="function";r&&t.__u(),r&&e==null||(t.__u=t(e))}else t.current=e}catch(o){g.__e(o,n)}}function Oe(t,e,n){var r,o;if(g.unmount&&g.unmount(t),(r=t.ref)&&(r.current&&r.current!=t.__e||pe(r,null,e)),(r=t.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(i){g.__e(i,e)}r.base=r.__P=null}if(r=t.__k)for(o=0;o<r.length;o++)r[o]&&Oe(r[o],e,n||typeof t.type!="function");n||ce(t.__e),t.__c=t.__=t.__e=void 0}function Ke(t,e,n){return this.constructor(t,n)}function Xe(t,e,n){var r,o,i,u;e==document&&(e=document.documentElement),g.__&&g.__(t,e),o=(r=!1)?null:e.__k,i=[],u=[],de(e,t=e.__k=We(ne,null,[t]),o||K,K,e.namespaceURI,o?null:e.firstChild?ee.call(e.childNodes):null,i,o?o.__e:e.firstChild,r,u),je(i,t,u)}ee=X.slice,g={__e:function(t,e,n,r){for(var o,i,u;e=e.__;)if((o=e.__c)&&!o.__)try{if((i=o.constructor)&&i.getDerivedStateFromError!=null&&(o.setState(i.getDerivedStateFromError(t)),u=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,r||{}),u=o.__d),u)return o.__E=o}catch(_){t=_}throw t}},Ce=0,V.prototype.setState=function(t,e){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=C({},this.state),typeof t=="function"&&(t=t(C({},n),this.props)),t&&C(n,t),t!=null&&this.__v&&(e&&this._sb.push(e),me(this))},V.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),me(this))},V.prototype.render=ne,T=[],Te=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Pe=function(t,e){return t.__v.__b-e.__v.__b},Y.__r=0,ie=Math.random().toString(8),Q="__d"+ie,F="__a"+ie,Ne=/(PointerCapture)$|Capture$/i,le=0,se=ge(!1),_e=ge(!0);var Ye=0;function d(t,e,n,r,o,i){e||(e={});var u,_,l=e;if("ref"in l)for(_ in l={},e)_=="ref"?u=e[_]:l[_]=e[_];var a={type:t,props:l,key:n,ref:u,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--Ye,__i:-1,__u:0,__source:o,__self:i};if(typeof t=="function"&&(u=t.defaultProps))for(_ in u)l[_]===void 0&&(l[_]=u[_]);return g.vnode&&g.vnode(a),a}var M,b,re,ye,B=0,Ae=[],k=g,be=k.__b,xe=k.__r,qe=k.diffed,ze=k.__c,ke=k.unmount,we=k.__;function fe(t,e){k.__h&&k.__h(b,t,B||e),B=0;var n=b.__H||(b.__H={__:[],__h:[]});return t>=n.__.length&&n.__.push({}),n.__[t]}function P(t){return B=1,et(Be,t)}function et(t,e,n){var r=fe(M++,2);if(r.t=t,!r.__c&&(r.__=[Be(void 0,e),function(_){var l=r.__N?r.__N[0]:r.__[0],a=r.t(l,_);l!==a&&(r.__N=[a,r.__[1]],r.__c.setState({}))}],r.__c=b,!b.__f)){var o=function(_,l,a){if(!r.__c.__H)return!0;var p=r.__c.__H.__.filter(function(f){return f.__c});if(p.every(function(f){return!f.__N}))return!i||i.call(this,_,l,a);var s=r.__c.props!==_;return p.some(function(f){if(f.__N){var c=f.__[0];f.__=f.__N,f.__N=void 0,c!==f.__[0]&&(s=!0)}}),i&&i.call(this,_,l,a)||s};b.__f=!0;var i=b.shouldComponentUpdate,u=b.componentWillUpdate;b.componentWillUpdate=function(_,l,a){if(this.__e){var p=i;i=void 0,o(_,l,a),i=p}u&&u.call(this,_,l,a)},b.shouldComponentUpdate=o}return r.__N||r.__}function O(t,e){var n=fe(M++,3);!k.__s&&Me(n.__H,e)&&(n.__=t,n.u=e,b.__H.__h.push(n))}function D(t){return B=5,Fe(function(){return{current:t}},[])}function Fe(t,e){var n=fe(M++,7);return Me(n.__H,e)&&(n.__=t(),n.__H=e,n.__h=t),n.__}function j(t,e){return B=8,Fe(function(){return t},e)}function tt(){for(var t;t=Ae.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(J),e.__h.some(ae),e.__h=[]}catch(n){e.__h=[],k.__e(n,t.__v)}}}k.__b=function(t){b=null,be&&be(t)},k.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),we&&we(t,e)},k.__r=function(t){xe&&xe(t),M=0;var e=(b=t.__c).__H;e&&(re===b?(e.__h=[],b.__h=[],e.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})):(e.__h.some(J),e.__h.some(ae),e.__h=[],M=0)),re=b},k.diffed=function(t){qe&&qe(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Ae.push(e)!==1&&ye===k.requestAnimationFrame||((ye=k.requestAnimationFrame)||nt)(tt)),e.__H.__.some(function(n){n.u&&(n.__H=n.u),n.u=void 0})),re=b=null},k.__c=function(t,e){e.some(function(n){try{n.__h.some(J),n.__h=n.__h.filter(function(r){return!r.__||ae(r)})}catch(r){e.some(function(o){o.__h&&(o.__h=[])}),e=[],k.__e(r,n.__v)}}),ze&&ze(t,e)},k.unmount=function(t){ke&&ke(t);var e,n=t.__c;n&&n.__H&&(n.__H.__.some(function(r){try{J(r)}catch(o){e=o}}),n.__H=void 0,e&&k.__e(e,n.__v))};var Se=typeof requestAnimationFrame=="function";function nt(t){var e,n=function(){clearTimeout(r),Se&&cancelAnimationFrame(e),setTimeout(t)},r=setTimeout(n,35);Se&&(e=requestAnimationFrame(n))}function J(t){var e=b,n=t.__c;typeof n=="function"&&(t.__c=void 0,n()),b=e}function ae(t){var e=b;t.__c=t.__(),b=e}function Me(t,e){return!t||t.length!==e.length||e.some(function(n,r){return n!==t[r]})}function Be(t,e){return typeof e=="function"?e(t):e}function it(t){const e=t.reduce((r,o)=>r+(o.trafficPct??0),0);if(e<=0)return t[0];let n=Math.random()*e;for(const r of t)if(n-=r.trafficPct??0,n<=0)return r;return t[t.length-1]}function rt(t,e){const n={};for(const o of Object.values(t.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const i=o.variantGroupId;n[i]||(n[i]=[]),n[i].push(o)}const r={};for(const[o,i]of Object.entries(n)){const u=`quiz_${e}_vg_${o}`,_=localStorage.getItem(u);if(_&&t.nodes[_])r[o]=_;else{const l=it(i);localStorage.setItem(u,l.id),r[o]=l.id}}return r}function ot(t,e){return Object.values(t.edges).filter(n=>n.from===e)}function st(t,e,n){return!t||t.kind==="default"?!1:t.kind==="option"?t.optionId===e&&t.questionElId===n:!1}function W(t,e,n,r,o){const i=ot(t,e);if(i.length===0)return null;if(n!==null){const _=i.find(l=>st(l.condition,n,r));if(_)return Ie(t,_.to,o)}const u=i.find(_=>!_.condition||_.condition.kind==="default")??i[0];return Ie(t,u.to,o)}function Ie(t,e,n){const r=t.nodes[e];if(!r)return null;if(r.kind!=="step")return r;if(r.variantGroupId){const o=n[r.variantGroupId];if(o)return t.nodes[o]??r}return r}function _t(t){return Object.values(t.nodes).find(e=>e.kind==="start")??null}function ut(){const t=new URLSearchParams(location.search),e={},n=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const r of n){const o=t.get(r);o&&(e[r]=o)}return e}class at{constructor(e,n){this.sessionId=e,this.flushFn=n,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(e){this.buf.push({...e,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const e=this.buf.splice(0);try{await this.flushFn(this.sessionId,e)}catch{this.buf.unshift(...e)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function lt(t,e,n,r,o){const i=await fetch(`${t}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:e,variant_assignments:n,utm:r,ua:navigator.userAgent,market:o})});if(!i.ok)throw new Error(`session start failed: ${i.status}`);return(await i.json()).session_id}async function ct(t,e,n){const r={session_id:e,events:n.map(i=>({event_type:i.event_type,step_id:i.step_id,variant_group_id:i.variant_group_id,option_id:i.option_id,meta:i.meta}))},o=await fetch(`${t}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function dt(t,e,n,r){const o=await fetch(`${t}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:e,email:n,listId:r})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}function pt({el:t}){const e=D(null);return O(()=>{e.current&&(e.current.innerHTML=t.text)},[t.text]),d("h1",{ref:e,"data-quiz-el":"title","data-quiz-el-id":t.id,class:"quiz-title"})}function ft({el:t}){const e=D(null);return O(()=>{e.current&&(e.current.innerHTML=t.text)},[t.text]),d("div",{ref:e,"data-quiz-el":"text","data-quiz-el-id":t.id,class:"quiz-text"})}function ht({el:t}){return d("img",{"data-quiz-el":"image","data-quiz-el-id":t.id,src:t.url,alt:t.alt,class:"quiz-image"})}function mt({el:t}){const e=D(null);return O(()=>{e.current&&(e.current.innerHTML=t.html)},[t.html]),d("div",{ref:e,"data-quiz-el":"custom_html","data-quiz-el-id":t.id,class:"quiz-custom-html"})}function vt({el:t,onComplete:e}){return O(()=>{const n=setTimeout(e,t.seconds*1e3);return()=>clearTimeout(n)},[t.seconds,e]),d("div",{"data-quiz-el":"loading","data-quiz-el-id":t.id,class:"quiz-loading",children:[d("div",{class:"quiz-loading-spinner"}),t.text&&d("p",{class:"quiz-loading-text",children:t.text})]})}function gt({option:t,layout:e,selected:n,onClick:r}){const o=["quiz-option",`quiz-option--${e}`,n?"quiz-option--selected":""].filter(Boolean).join(" ");return d("button",{class:o,"data-quiz-opt-id":t.id,onClick:r,type:"button",children:[e==="image_cards"&&t.imageUrl&&d("img",{src:t.imageUrl,alt:t.label,class:"quiz-option-img"}),t.emoji&&d("span",{class:"quiz-option-emoji",children:t.emoji}),d("span",{class:"quiz-option-label",children:t.label})]})}function yt({el:t,onAnswer:e}){const[n,r]=P(new Set),o=i=>{t.kindOf==="single"?(r(new Set([i])),setTimeout(()=>e(t.id,i),200)):r(u=>{const _=new Set(u);return _.has(i)?_.delete(i):_.add(i),_})};return d("div",{"data-quiz-el":"question","data-quiz-el-id":t.id,class:`quiz-question quiz-question--${t.layout}`,children:[t.options.map(i=>d(gt,{option:i,layout:t.layout,selected:n.has(i.id),onClick:()=>o(i.id)},i.id)),t.kindOf==="multi"&&n.size>0&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const i=[...n][0];e(t.id,i)},children:"Continue"})]})}function bt({onSubmit:t}){const[e,n]=P(""),[r,o]=P("");return d("form",{class:"quiz-email-form",onSubmit:u=>{if(u.preventDefault(),!e.includes("@")){o("Please enter a valid email address.");return}o(""),t(e)},novalidate:!0,children:[d("input",{type:"email",class:"quiz-email-input",placeholder:"your@email.com",value:e,onInput:u=>n(u.target.value),required:!0}),r&&d("p",{class:"quiz-email-error",children:r}),d("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:"Continue"})]})}function xt({node:t,onAnswer:e,onLoadingComplete:n,onEmailSubmit:r,captureAtStepId:o}){return d("div",{class:"quiz-step","data-step-id":t.id,children:[t.subEls.map(i=>{switch(i.kind){case"title":return d(pt,{el:i},i.id);case"text":return d(ft,{el:i},i.id);case"image":return d(ht,{el:i},i.id);case"custom_html":return d(mt,{el:i},i.id);case"loading":return d(vt,{el:i,onComplete:n},i.id);case"question":return d(yt,{el:i,onAnswer:e},i.id)}}),o===t.id&&d(bt,{onSubmit:r})]})}function qt({current:t,total:e}){const n=e>0?Math.round(t/e*100):0;return d("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":n,"aria-valuemax":100,children:d("div",{class:"quiz-progress-bar",style:{width:`${n}%`}})})}function zt(t){const{brandColors:e,fontSettings:n}=t,r=n.enabled&&n.fontFamily?n.fontFamily:"Inter, system-ui, sans-serif";if(n.enabled&&n.fontFamily&&n.fontFamily!=="Inter"){const i=document.createElement("link");i.rel="stylesheet",i.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(n.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(i)}const o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${e.background};
  --quiz-text-primary: ${e.textPrimary};
  --quiz-text-secondary: ${e.textSecondary};
  --quiz-brand: ${e.primaryBrand};
  --quiz-option-bg: ${e.optionBackground};
  --quiz-font: ${r};
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
}
.quiz-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 8px;
}
.quiz-logo { height: 32px; object-fit: contain; }
.quiz-back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--quiz-text-secondary);
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
}
.quiz-back-btn:hover { background: rgba(0,0,0,0.06); }
.quiz-step-count {
  font-size: 13px;
  color: var(--quiz-text-secondary);
  margin-left: auto;
}
.quiz-progress {
  width: 100%;
  height: 4px;
  background: rgba(0,0,0,0.08);
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
  max-width: 600px;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.quiz-step { display: flex; flex-direction: column; gap: 16px; }
.quiz-title {
  font-size: clamp(22px, 5vw, 32px);
  font-weight: 700;
  line-height: 1.25;
  color: var(--quiz-text-primary);
}
.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
}
.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 300px; }
.quiz-custom-html {}
.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; }
.quiz-option {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--quiz-option-bg);
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  width: 100%;
}
.quiz-option:hover { border-color: var(--quiz-brand); }
.quiz-option--selected {
  border-color: var(--quiz-brand);
  background: color-mix(in srgb, var(--quiz-brand) 10%, var(--quiz-option-bg));
}
.quiz-option--cards { width: calc(50% - 5px); flex-direction: column; text-align: center; padding: 16px 12px; }
.quiz-option--image_cards { width: calc(50% - 5px); flex-direction: column; text-align: center; padding: 12px; }
.quiz-option-img { width: 100%; height: 80px; object-fit: cover; border-radius: 8px; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 500; }
.quiz-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px 0; }
.quiz-loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(0,0,0,0.1);
  border-top-color: var(--quiz-brand);
  border-radius: 50%;
  animation: quiz-spin 0.8s linear infinite;
}
@keyframes quiz-spin { to { transform: rotate(360deg); } }
.quiz-loading-text { font-size: 16px; color: var(--quiz-text-secondary); }
.quiz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 28px; border-radius: 10px;
  font-size: 16px; font-weight: 600; font-family: var(--quiz-font);
  cursor: pointer; border: none; transition: opacity 0.15s;
}
.quiz-btn:hover { opacity: 0.88; }
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }
.quiz-question-continue { margin-top: 8px; }
.quiz-email-form { display: flex; flex-direction: column; gap: 10px; }
.quiz-email-input {
  width: 100%; padding: 14px 16px;
  border: 2px solid rgba(0,0,0,0.12); border-radius: 10px;
  font-size: 16px; font-family: var(--quiz-font);
  background: var(--quiz-option-bg); color: var(--quiz-text-primary);
  outline: none;
}
.quiz-email-input:focus { border-color: var(--quiz-brand); }
.quiz-email-error { font-size: 13px; color: #dc2626; }
@media (max-width: 400px) {
  .quiz-option--cards, .quiz-option--image_cards { width: 100%; }
}
  `,document.head.appendChild(o)}function kt(t){const e=Object.values(t.nodes).filter(_=>_.kind==="step"),n=new Set(e.map(_=>_.id)),r=Object.values(t.nodes).find(_=>_.kind==="start"),o=[];if(r)for(const _ of Object.values(t.edges))_.from===r.id&&n.has(_.to)&&o.push(_.to);else for(const _ of e)o.push(_.id);const i=new Set,u=[];for(;o.length;){const _=o.shift();if(i.has(_))continue;i.add(_);const l=t.nodes[_];l&&l.kind==="step"&&u.push(l);for(const a of Object.values(t.edges))a.from===_&&n.has(a.to)&&!i.has(a.to)&&o.push(a.to)}for(const _ of e)i.has(_.id)||u.push(_);return u}function oe(t,e){typeof window.fbq=="function"&&window.fbq("track",t,e)}function wt({data:t,settings:e,config:n}){const[r,o]=P(null),[i,u]=P([]),[_,l]=P(null),[a,p]=P({}),[s,f]=P(0),c=D(null),y=D(!1),w=kt(t),x=w.length;O(()=>{if(y.current)return;y.current=!0;const h=rt(t,n.quizId);p(h);const q=_t(t);if(!q){console.error("[quiz-runtime] No start node found");return}const z=W(t,q.id,null,null,h);if(o(z),!n.preview&&e.providers.metaPixel?.pixelId&&oe("PageView",{}),n.preview)return;const U=ut();lt(n.apiBaseUrl,n.quizId,h,U,t.id??"").then(H=>{l(H),c.current=new at(H,(De,Ge)=>ct(n.apiBaseUrl,De,Ge)),z&&z.kind==="step"&&c.current.push({event_type:"step_view",step_id:z.id,variant_group_id:z.variantGroupId})}).catch(H=>{console.warn("[quiz-runtime] session start failed:",H)})},[]),O(()=>()=>c.current?.destroy(),[]);const m=j((h,q=!0)=>{if(q&&r&&u(z=>[...z,r]),o(h),h.kind==="step"){const z=w.findIndex(U=>U.id===h.id);z>=0&&f(z),n.preview||c.current?.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId})}},[r,w,n.preview]),v=j((h,q)=>{if(!r||r.kind!=="step")return;n.preview||c.current?.push({event_type:"answer",step_id:r.id,variant_group_id:r.variantGroupId,option_id:q,meta:{questionElId:h}});const z=W(t,r.id,q,h,a);z&&m(z)},[r,t,a,m]),I=j(()=>{if(!r||r.kind!=="step")return;const h=W(t,r.id,null,null,a);h&&m(h)},[r,t,a,m]),$=j(async h=>{if(!n.preview&&(c.current?.push({event_type:"email_capture",step_id:r?.kind==="step"?r.id:void 0,meta:{email:h}}),e.providers.metaPixel?.pixelId&&oe("Lead",{content_name:e.metadata.title,value:0}),e.providers.klaviyo?.listId&&_))try{await dt(n.apiBaseUrl,_,h,e.providers.klaviyo.listId)}catch(q){console.warn("[quiz-runtime] Klaviyo subscribe failed:",q)}if(r&&r.kind==="step"){const q=W(t,r.id,null,null,a);q&&m(q)}},[r,t,a,m,_,e,n]),N=j(()=>{n.preview||c.current?.push({event_type:"back",step_id:r?.kind==="step"?r.id:void 0}),u(h=>{if(h.length===0)return h;const q=h[h.length-1],z=h.slice(0,-1);if(o(q),q.kind==="step"){const U=w.findIndex(H=>H.id===q.id);U>=0&&f(U)}return z})},[r,w]),G=j(h=>{if(n.preview){const q=h.redirectUrl||e.redirectUrl||"(no redirect URL)";alert(`[Preview] Would redirect to:
${q}`);return}c.current?.push({event_type:"exit_click"}),e.providers.metaPixel?.pixelId&&oe("CompleteRegistration",{content_name:e.metadata.title,value:0}),c.current?.flush().finally(()=>{const q=h.redirectUrl||e.redirectUrl||"",z=new URL(q,location.href);z.searchParams.set("utm_source","quiz"),z.searchParams.set("utm_campaign",document.title||"quiz"),_&&z.searchParams.set("utm_content",_),location.href=z.toString()})},[e,_,n.preview]);if(r?.kind==="exit"){const h=r;return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content quiz-exit",children:[d("p",{class:"quiz-text",children:"Loading your results..."}),d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>G(h),children:"See my results"})]})})}if(!r||r.kind!=="step")return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content",children:d("div",{class:"quiz-loading",children:d("div",{class:"quiz-loading-spinner"})})})});const E=r,A=e.backNavigation&&i.length>0,S=e.providers.klaviyo?.captureAtStepId;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-header",children:[A&&d("button",{class:"quiz-back-btn",type:"button",onClick:N,"aria-label":"Go back",children:"←"}),e.brandLogo?.enabled&&e.brandLogo.url&&d("img",{src:e.brandLogo.url,alt:"Logo",class:"quiz-logo"}),e.stepProgressCount&&d("span",{class:"quiz-step-count",children:[s+1," / ",x]})]}),e.progressBar&&d(qt,{current:s+1,total:x}),d("div",{class:"quiz-content",children:d(xt,{node:E,onAnswer:v,onLoadingComplete:I,onEmailSubmit:$,captureAtStepId:S})})]})}function $e(){const t=window.__QUIZ_DATA__,e=window.__QUIZ_SETTINGS__,n=window.__QUIZ_CONFIG__;if(!t||!e||!n){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}zt(e);const r=document.getElementById("quiz-root");if(!r){console.error("[quiz-runtime] #quiz-root element not found");return}Xe(d(wt,{data:t,settings:e,config:n}),r)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",$e):$e();
