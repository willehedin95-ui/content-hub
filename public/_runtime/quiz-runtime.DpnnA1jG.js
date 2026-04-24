var ne,g,Pe,P,ve,Ee,Ne,oe,Z,D,Ue,de,ae,le,X={},ee=[],Ve=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ie=Array.isArray;function C(t,e){for(var n in e)t[n]=e[n];return t}function pe(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function Ze(t,e,n){var i,o,r,a={};for(r in e)r=="key"?i=e[r]:r=="ref"?o=e[r]:a[r]=e[r];if(arguments.length>2&&(a.children=arguments.length>3?ne.call(arguments,2):n),typeof t=="function"&&t.defaultProps!=null)for(r in t.defaultProps)a[r]===void 0&&(a[r]=t.defaultProps[r]);return J(t,a,i,o,null)}function J(t,e,n,i,o){var r={type:t,props:e,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Pe,__i:-1,__u:0};return o==null&&g.vnode!=null&&g.vnode(r),r}function re(t){return t.children}function K(t,e){this.props=t,this.context=e}function F(t,e){if(e==null)return t.__?F(t.__,t.__i+1):null;for(var n;e<t.__k.length;e++)if((n=t.__k[e])!=null&&n.__e!=null)return n.__e;return typeof t.type=="function"?F(t):null}function Je(t){if(t.__P&&t.__d){var e=t.__v,n=e.__e,i=[],o=[],r=C({},e);r.__v=e.__v+1,g.vnode&&g.vnode(r),fe(t.__P,r,e,t.__n,t.__P.namespaceURI,32&e.__u?[n]:null,i,n??F(e),!!(32&e.__u),o),r.__v=e.__v,r.__.__k[r.__i]=r,je(i,r,o),e.__e=e.__=null,r.__e!=n&&Ae(r)}}function Ae(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),Ae(t)}function ge(t){(!t.__d&&(t.__d=!0)&&P.push(t)&&!te.__r++||ve!=g.debounceRendering)&&((ve=g.debounceRendering)||Ee)(te)}function te(){try{for(var t,e=1;P.length;)P.length>e&&P.sort(Ne),t=P.shift(),e=P.length,Je(t)}finally{P.length=te.__r=0}}function He(t,e,n,i,o,r,a,s,_,l,c){var u,f,d,y,w,x,h,v=i&&i.__k||ee,I=e.length;for(_=Ke(n,e,v,_,I),u=0;u<I;u++)(d=n.__k[u])!=null&&(f=d.__i!=-1&&v[d.__i]||X,d.__i=u,x=fe(t,d,f,o,r,a,s,_,l,c),y=d.__e,d.ref&&f.ref!=d.ref&&(f.ref&&he(f.ref,null,d),c.push(d.ref,d.__c||y,d)),w==null&&y!=null&&(w=y),(h=!!(4&d.__u))||f.__k===d.__k?(_=Le(d,_,t,h),h&&f.__e&&(f.__e=null)):typeof d.type=="function"&&x!==void 0?_=x:y&&(_=y.nextSibling),d.__u&=-7);return n.__e=w,_}function Ke(t,e,n,i,o){var r,a,s,_,l,c=n.length,u=c,f=0;for(t.__k=new Array(o),r=0;r<o;r++)(a=e[r])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=t.__k[r]=J(null,a,null,null,null):ie(a)?a=t.__k[r]=J(re,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=t.__k[r]=J(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):t.__k[r]=a,_=r+f,a.__=t,a.__b=t.__b+1,s=null,(l=a.__i=Ye(a,n,_,u))!=-1&&(u--,(s=n[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(o>c?f--:o<c&&f++),typeof a.type!="function"&&(a.__u|=4)):l!=_&&(l==_-1?f--:l==_+1?f++:(l>_?f--:f++,a.__u|=4))):t.__k[r]=null;if(u)for(r=0;r<c;r++)(s=n[r])!=null&&(2&s.__u)==0&&(s.__e==i&&(i=F(s)),Oe(s,s));return i}function Le(t,e,n,i){var o,r;if(typeof t.type=="function"){for(o=t.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=t,e=Le(o[r],e,n,i));return e}t.__e!=e&&(i&&(e&&t.type&&!e.parentNode&&(e=F(t)),n.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function Ye(t,e,n,i){var o,r,a,s=t.key,_=t.type,l=e[n],c=l!=null&&(2&l.__u)==0;if(l===null&&s==null||c&&s==l.key&&_==l.type)return n;if(i>(c?1:0)){for(o=n-1,r=n+1;o>=0||r<e.length;)if((l=e[a=o>=0?o--:r++])!=null&&(2&l.__u)==0&&s==l.key&&_==l.type)return a}return-1}function ye(t,e,n){e[0]=="-"?t.setProperty(e,n??""):t[e]=n==null?"":typeof n!="number"||Ve.test(e)?n:n+"px"}function V(t,e,n,i,o){var r,a;e:if(e=="style")if(typeof n=="string")t.style.cssText=n;else{if(typeof i=="string"&&(t.style.cssText=i=""),i)for(e in i)n&&e in n||ye(t.style,e,"");if(n)for(e in n)i&&n[e]==i[e]||ye(t.style,e,n[e])}else if(e[0]=="o"&&e[1]=="n")r=e!=(e=e.replace(Ue,"$1")),a=e.toLowerCase(),e=a in t||e=="onFocusOut"||e=="onFocusIn"?a.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+r]=n,n?i?n[D]=i[D]:(n[D]=de,t.addEventListener(e,r?le:ae,r)):t.removeEventListener(e,r?le:ae,r);else{if(o=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&n==1?"":n))}}function be(t){return function(e){if(this.l){var n=this.l[e.type+t];if(e[Z]==null)e[Z]=de++;else if(e[Z]<n[D])return;return n(g.event?g.event(e):e)}}}function fe(t,e,n,i,o,r,a,s,_,l){var c,u,f,d,y,w,x,h,v,I,$,N,Q,H,M,S=e.type;if(e.constructor!==void 0)return null;128&n.__u&&(_=!!(32&n.__u),r=[s=e.__e=n.__e]),(c=g.__b)&&c(e);e:if(typeof S=="function")try{if(h=e.props,v=S.prototype&&S.prototype.render,I=(c=S.contextType)&&i[c.__c],$=c?I?I.props.value:c.__:i,n.__c?x=(u=e.__c=n.__c).__=u.__E:(v?e.__c=u=new S(h,$):(e.__c=u=new K(h,$),u.constructor=S,u.render=et),I&&I.sub(u),u.state||(u.state={}),u.__n=i,f=u.__d=!0,u.__h=[],u._sb=[]),v&&u.__s==null&&(u.__s=u.state),v&&S.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=C({},u.__s)),C(u.__s,S.getDerivedStateFromProps(h,u.__s))),d=u.props,y=u.state,u.__v=e,f)v&&S.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),v&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(v&&S.getDerivedStateFromProps==null&&h!==d&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(h,$),e.__v==n.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(h,u.__s,$)===!1){e.__v!=n.__v&&(u.props=h,u.state=u.__s,u.__d=!1),e.__e=n.__e,e.__k=n.__k,e.__k.some(function(T){T&&(T.__=e)}),ee.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&a.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(h,u.__s,$),v&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(d,y,w)})}if(u.context=$,u.props=h,u.__P=t,u.__e=!1,N=g.__r,Q=0,v)u.state=u.__s,u.__d=!1,N&&N(e),c=u.render(u.props,u.state,u.context),ee.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,N&&N(e),c=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++Q<25);u.state=u.__s,u.getChildContext!=null&&(i=C(C({},i),u.getChildContext())),v&&!f&&u.getSnapshotBeforeUpdate!=null&&(w=u.getSnapshotBeforeUpdate(d,y)),H=c!=null&&c.type===re&&c.key==null?Fe(c.props.children):c,s=He(t,ie(H)?H:[H],e,n,i,o,r,a,s,_,l),u.base=e.__e,e.__u&=-161,u.__h.length&&a.push(u),x&&(u.__E=u.__=null)}catch(T){if(e.__v=null,_||r!=null)if(T.then){for(e.__u|=_?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,e.__e=s}else{for(M=r.length;M--;)pe(r[M]);_e(e)}else e.__e=n.__e,e.__k=n.__k,T.then||_e(e);g.__e(T,e,n)}else r==null&&e.__v==n.__v?(e.__k=n.__k,e.__e=n.__e):s=e.__e=Xe(n.__e,e,n,i,o,r,a,_,l);return(c=g.diffed)&&c(e),128&e.__u?void 0:s}function _e(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(_e))}function je(t,e,n){for(var i=0;i<n.length;i++)he(n[i],n[++i],n[++i]);g.__c&&g.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(r){r.call(o)})}catch(r){g.__e(r,o.__v)}})}function Fe(t){return typeof t!="object"||t==null||t.__b>0?t:ie(t)?t.map(Fe):C({},t)}function Xe(t,e,n,i,o,r,a,s,_){var l,c,u,f,d,y,w,x=n.props||X,h=e.props,v=e.type;if(v=="svg"?o="http://www.w3.org/2000/svg":v=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((d=r[l])&&"setAttribute"in d==!!v&&(v?d.localName==v:d.nodeType==3)){t=d,r[l]=null;break}}if(t==null){if(v==null)return document.createTextNode(h);t=document.createElementNS(o,v,h.is&&h),s&&(g.__m&&g.__m(e,r),s=!1),r=null}if(v==null)x===h||s&&t.data==h||(t.data=h);else{if(r=r&&ne.call(t.childNodes),!s&&r!=null)for(x={},l=0;l<t.attributes.length;l++)x[(d=t.attributes[l]).name]=d.value;for(l in x)d=x[l],l=="dangerouslySetInnerHTML"?u=d:l=="children"||l in h||l=="value"&&"defaultValue"in h||l=="checked"&&"defaultChecked"in h||V(t,l,null,d,o);for(l in h)d=h[l],l=="children"?f=d:l=="dangerouslySetInnerHTML"?c=d:l=="value"?y=d:l=="checked"?w=d:s&&typeof d!="function"||x[l]===d||V(t,l,d,x[l],o);if(c)s||u&&(c.__html==u.__html||c.__html==t.innerHTML)||(t.innerHTML=c.__html),e.__k=[];else if(u&&(t.innerHTML=""),He(e.type=="template"?t.content:t,ie(f)?f:[f],e,n,i,v=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,a,r?r[0]:n.__k&&F(n,0),s,_),r!=null)for(l=r.length;l--;)pe(r[l]);s||(l="value",v=="progress"&&y==null?t.removeAttribute("value"):y!=null&&(y!==t[l]||v=="progress"&&!y||v=="option"&&y!=x[l])&&V(t,l,y,x[l],o),l="checked",w!=null&&w!=t[l]&&V(t,l,w,x[l],o))}return t}function he(t,e,n){try{if(typeof t=="function"){var i=typeof t.__u=="function";i&&t.__u(),i&&e==null||(t.__u=t(e))}else t.current=e}catch(o){g.__e(o,n)}}function Oe(t,e,n){var i,o;if(g.unmount&&g.unmount(t),(i=t.ref)&&(i.current&&i.current!=t.__e||he(i,null,e)),(i=t.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(r){g.__e(r,e)}i.base=i.__P=null}if(i=t.__k)for(o=0;o<i.length;o++)i[o]&&Oe(i[o],e,n||typeof t.type!="function");n||pe(t.__e),t.__c=t.__=t.__e=void 0}function et(t,e,n){return this.constructor(t,n)}function tt(t,e,n){var i,o,r,a;e==document&&(e=document.documentElement),g.__&&g.__(t,e),o=(i=!1)?null:e.__k,r=[],a=[],fe(e,t=e.__k=Ze(re,null,[t]),o||X,X,e.namespaceURI,o?null:e.firstChild?ne.call(e.childNodes):null,r,o?o.__e:e.firstChild,i,a),je(r,t,a)}ne=ee.slice,g={__e:function(t,e,n,i){for(var o,r,a;e=e.__;)if((o=e.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(t)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,i||{}),a=o.__d),a)return o.__E=o}catch(s){t=s}throw t}},Pe=0,K.prototype.setState=function(t,e){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=C({},this.state),typeof t=="function"&&(t=t(C({},n),this.props)),t&&C(n,t),t!=null&&this.__v&&(e&&this._sb.push(e),ge(this))},K.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),ge(this))},K.prototype.render=re,P=[],Ee=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ne=function(t,e){return t.__v.__b-e.__v.__b},te.__r=0,oe=Math.random().toString(8),Z="__d"+oe,D="__a"+oe,Ue=/(PointerCapture)$|Capture$/i,de=0,ae=be(!1),le=be(!0);var nt=0;function p(t,e,n,i,o,r){e||(e={});var a,s,_=e;if("ref"in _)for(s in _={},e)s=="ref"?a=e[s]:_[s]=e[s];var l={type:t,props:_,key:n,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--nt,__i:-1,__u:0,__source:o,__self:r};if(typeof t=="function"&&(a=t.defaultProps))for(s in a)_[s]===void 0&&(_[s]=a[s]);return g.vnode&&g.vnode(l),l}var R,b,se,xe,G=0,Me=[],k=g,qe=k.__b,ze=k.__r,ke=k.diffed,we=k.__c,Se=k.unmount,Ie=k.__;function me(t,e){k.__h&&k.__h(b,t,G||e),G=0;var n=b.__H||(b.__H={__:[],__h:[]});return t>=n.__.length&&n.__.push({}),n.__[t]}function E(t){return G=1,it(Re,t)}function it(t,e,n){var i=me(R++,2);if(i.t=t,!i.__c&&(i.__=[Re(void 0,e),function(s){var _=i.__N?i.__N[0]:i.__[0],l=i.t(_,s);_!==l&&(i.__N=[l,i.__[1]],i.__c.setState({}))}],i.__c=b,!b.__f)){var o=function(s,_,l){if(!i.__c.__H)return!0;var c=i.__c.__H.__.filter(function(f){return f.__c});if(c.every(function(f){return!f.__N}))return!r||r.call(this,s,_,l);var u=i.__c.props!==s;return c.some(function(f){if(f.__N){var d=f.__[0];f.__=f.__N,f.__N=void 0,d!==f.__[0]&&(u=!0)}}),r&&r.call(this,s,_,l)||u};b.__f=!0;var r=b.shouldComponentUpdate,a=b.componentWillUpdate;b.componentWillUpdate=function(s,_,l){if(this.__e){var c=r;r=void 0,o(s,_,l),r=c}a&&a.call(this,s,_,l)},b.shouldComponentUpdate=o}return i.__N||i.__}function O(t,e){var n=me(R++,3);!k.__s&&De(n.__H,e)&&(n.__=t,n.u=e,b.__H.__h.push(n))}function W(t){return G=5,Be(function(){return{current:t}},[])}function Be(t,e){var n=me(R++,7);return De(n.__H,e)&&(n.__=t(),n.__H=e,n.__h=t),n.__}function U(t,e){return G=8,Be(function(){return t},e)}function rt(){for(var t;t=Me.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(Y),e.__h.some(ce),e.__h=[]}catch(n){e.__h=[],k.__e(n,t.__v)}}}k.__b=function(t){b=null,qe&&qe(t)},k.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),Ie&&Ie(t,e)},k.__r=function(t){ze&&ze(t),R=0;var e=(b=t.__c).__H;e&&(se===b?(e.__h=[],b.__h=[],e.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})):(e.__h.some(Y),e.__h.some(ce),e.__h=[],R=0)),se=b},k.diffed=function(t){ke&&ke(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Me.push(e)!==1&&xe===k.requestAnimationFrame||((xe=k.requestAnimationFrame)||ot)(rt)),e.__H.__.some(function(n){n.u&&(n.__H=n.u),n.u=void 0})),se=b=null},k.__c=function(t,e){e.some(function(n){try{n.__h.some(Y),n.__h=n.__h.filter(function(i){return!i.__||ce(i)})}catch(i){e.some(function(o){o.__h&&(o.__h=[])}),e=[],k.__e(i,n.__v)}}),we&&we(t,e)},k.unmount=function(t){Se&&Se(t);var e,n=t.__c;n&&n.__H&&(n.__H.__.some(function(i){try{Y(i)}catch(o){e=o}}),n.__H=void 0,e&&k.__e(e,n.__v))};var $e=typeof requestAnimationFrame=="function";function ot(t){var e,n=function(){clearTimeout(i),$e&&cancelAnimationFrame(e),setTimeout(t)},i=setTimeout(n,35);$e&&(e=requestAnimationFrame(n))}function Y(t){var e=b,n=t.__c;typeof n=="function"&&(t.__c=void 0,n()),b=e}function ce(t){var e=b;t.__c=t.__(),b=e}function De(t,e){return!t||t.length!==e.length||e.some(function(n,i){return n!==t[i]})}function Re(t,e){return typeof e=="function"?e(t):e}function st(t){const e=t.reduce((i,o)=>i+(o.trafficPct??0),0);if(e<=0)return t[0];let n=Math.random()*e;for(const i of t)if(n-=i.trafficPct??0,n<=0)return i;return t[t.length-1]}function ut(t,e){const n={};for(const o of Object.values(t.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;n[r]||(n[r]=[]),n[r].push(o)}const i={};for(const[o,r]of Object.entries(n)){const a=`quiz_${e}_vg_${o}`,s=localStorage.getItem(a);if(s&&t.nodes[s])i[o]=s;else{const _=st(r);localStorage.setItem(a,_.id),i[o]=_.id}}return i}function at(t,e){return Object.values(t.edges).filter(n=>n.from===e)}function lt(t,e,n){return!t||t.kind==="default"?!1:t.kind==="option"?t.optionId===e&&t.questionElId===n:!1}function B(t,e,n,i,o){const r=at(t,e);if(r.length===0)return null;if(n!==null){const s=r.find(_=>lt(_.condition,n,i));if(s)return Ce(t,s.to,o)}const a=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return Ce(t,a.to,o)}function Ce(t,e,n){const i=t.nodes[e];if(!i)return null;if(i.kind!=="step")return i;if(i.variantGroupId){const o=n[i.variantGroupId];if(o)return t.nodes[o]??i}return i}function _t(t){return Object.values(t.nodes).find(e=>e.kind==="start")??null}function ct(){const t=new URLSearchParams(location.search),e={},n=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const i of n){const o=t.get(i);o&&(e[i]=o)}return e}class dt{constructor(e,n){this.sessionId=e,this.flushFn=n,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(e){this.buf.push({...e,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const e=this.buf.splice(0);try{await this.flushFn(this.sessionId,e)}catch{this.buf.unshift(...e)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function pt(t,e,n,i,o){const r=await fetch(`${t}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:e,variant_assignments:n,utm:i,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function ft(t,e,n){const i={session_id:e,events:n.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${t}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function ht(t,e,n,i){const o=await fetch(`${t}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:e,email:n,listId:i})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const mt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."}};function A(t,e){const n=e??"en",i=mt[t];return n in i?i[n]:i.en}function Ge(t){if(!t)return;const e=n=>{n.removeAttribute("style"),n.removeAttribute("class");for(const i of Array.from(n.children))e(i)};e(t)}function vt({el:t}){const e=W(null);return O(()=>{e.current&&(e.current.innerHTML=t.text,Ge(e.current))},[t.text]),p("h1",{ref:e,"data-quiz-el":"title","data-quiz-el-id":t.id,class:"quiz-title"})}function gt({el:t}){const e=W(null);return O(()=>{e.current&&(e.current.innerHTML=t.text,Ge(e.current))},[t.text]),p("div",{ref:e,"data-quiz-el":"text","data-quiz-el-id":t.id,class:"quiz-text"})}function yt({el:t}){return p("img",{"data-quiz-el":"image","data-quiz-el-id":t.id,src:t.url,alt:t.alt,class:"quiz-image"})}function bt(t){const e=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const n of e)for(const i of Array.from(t.querySelectorAll(n)))i.parentNode?.removeChild(i);t.innerText.trim().length===0&&(t.style.display="none")}function xt({el:t}){const e=W(null);return O(()=>{e.current&&(e.current.innerHTML=t.html,bt(e.current))},[t.html]),p("div",{ref:e,"data-quiz-el":"custom_html","data-quiz-el-id":t.id,class:"quiz-custom-html"})}function qt({el:t,onComplete:e}){return O(()=>{const n=setTimeout(e,t.seconds*1e3);return()=>clearTimeout(n)},[t.seconds,e]),p("div",{"data-quiz-el":"loading","data-quiz-el-id":t.id,class:"quiz-loading",children:[p("div",{class:"quiz-loading-spinner"}),t.text&&p("p",{class:"quiz-loading-text",children:t.text})]})}function zt({option:t,layout:e,selected:n,onClick:i}){const o=["quiz-option",`quiz-option--${e}`,n?"quiz-option--selected":""].filter(Boolean).join(" ");return p("button",{class:o,"data-quiz-opt-id":t.id,onClick:i,type:"button",children:[e==="image_cards"&&t.imageUrl&&p("img",{src:t.imageUrl,alt:t.label,class:"quiz-option-img"}),t.emoji&&p("span",{class:"quiz-option-emoji",children:t.emoji}),p("span",{class:"quiz-option-label",children:t.label})]})}function kt({el:t,onAnswer:e,market:n}){const[i,o]=E(new Set),r=a=>{t.kindOf==="single"?(o(new Set([a])),setTimeout(()=>e(t.id,a),200)):o(s=>{const _=new Set(s);return _.has(a)?_.delete(a):_.add(a),_})};return p("div",{"data-quiz-el":"question","data-quiz-el-id":t.id,class:`quiz-question quiz-question--${t.layout}`,children:[t.options.map(a=>p(zt,{option:a,layout:t.layout,selected:i.has(a.id),onClick:()=>r(a.id)},a.id)),t.kindOf==="multi"&&i.size>0&&p("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const a=[...i][0];e(t.id,a)},children:A("continue",n)})]})}function wt({onSubmit:t,market:e}){const[n,i]=E(""),[o,r]=E("");return p("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!n.includes("@")){r(A("invalidEmail",e));return}r(""),t(n)},novalidate:!0,children:[p("input",{type:"email",class:"quiz-email-input",placeholder:A("emailPlaceholder",e),value:n,onInput:s=>i(s.target.value),required:!0}),o&&p("p",{class:"quiz-email-error",children:o}),p("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:A("continue",e)})]})}function St({node:t,onAnswer:e,onLoadingComplete:n,onEmailSubmit:i,captureAtStepId:o,market:r,onContinue:a}){const s=t.subEls.some(c=>c.kind==="question"),_=t.subEls.some(c=>c.kind==="loading"),l=!s&&!_&&typeof a=="function";return p("div",{class:"quiz-step","data-step-id":t.id,children:[t.subEls.map(c=>{switch(c.kind){case"title":return p(vt,{el:c},c.id);case"text":return p(gt,{el:c},c.id);case"image":return p(yt,{el:c},c.id);case"custom_html":return p(xt,{el:c},c.id);case"loading":return p(qt,{el:c,onComplete:n},c.id);case"question":return p(kt,{el:c,onAnswer:e,market:r},c.id)}}),o===t.id&&p(wt,{onSubmit:i,market:r}),l&&p("div",{class:"quiz-continue-wrap",children:p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,children:A("continue",r)})})]})}function It({current:t,total:e}){const n=e>0?Math.round(t/e*100):0;return p("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":n,"aria-valuemax":100,children:p("div",{class:"quiz-progress-bar",style:{width:`${n}%`}})})}function $t(t){const{brandColors:e,fontSettings:n}=t,i=n.enabled&&n.fontFamily?n.fontFamily:"Inter, system-ui, sans-serif";if(n.enabled&&n.fontFamily&&n.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(n.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${e.background};
  --quiz-text-primary: ${e.textPrimary};
  --quiz-text-secondary: ${e.textSecondary};
  --quiz-brand: ${e.primaryBrand};
  --quiz-option-bg: ${e.optionBackground};
  --quiz-font: ${i};
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
  padding: 32px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}

.quiz-step { display: flex; flex-direction: column; gap: 20px; }

.quiz-title {
  font-size: clamp(28px, 5.5vw, 40px);
  font-weight: 800;
  line-height: 1.2;
  color: var(--quiz-text-primary);
  letter-spacing: -0.015em;
  margin-bottom: 4px;
}

.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
}

.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 320px; }

.quiz-custom-html { font-size: 15px; line-height: 1.6; color: var(--quiz-text-secondary); }
.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 12px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; }

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: 1.5px solid rgba(0,0,0,0.15);
  border-radius: 12px;
  padding: 18px 20px;
  min-height: 56px;
  font-size: 16px;
  font-weight: 500;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, transform 0.1s, box-shadow 0.15s;
  width: 100%;
}
.quiz-option:hover {
  border-color: rgba(0,0,0,0.35);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.quiz-option--selected {
  border-color: var(--quiz-brand);
  border-width: 2px;
  background: color-mix(in srgb, var(--quiz-brand) 8%, var(--quiz-option-bg));
}
.quiz-option--cards { width: calc(50% - 6px); flex-direction: column; text-align: center; padding: 20px 12px; }
.quiz-option--image_cards { width: calc(50% - 6px); flex-direction: column; text-align: center; padding: 16px 12px; }
.quiz-option-img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 500; flex: 1; }

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

@media (max-width: 480px) {
  .quiz-option--cards, .quiz-option--image_cards { width: 100%; }
  .quiz-content { padding: 24px 16px 48px; }
}
  `,document.head.appendChild(o)}function Ct(t){const e=Object.values(t.nodes).filter(s=>s.kind==="step"),n=new Set(e.map(s=>s.id)),i=Object.values(t.nodes).find(s=>s.kind==="start"),o=[];if(i)for(const s of Object.values(t.edges))s.from===i.id&&n.has(s.to)&&o.push(s.to);else for(const s of e)o.push(s.id);const r=new Set,a=[];for(;o.length;){const s=o.shift();if(r.has(s))continue;r.add(s);const _=t.nodes[s];_&&_.kind==="step"&&a.push(_);for(const l of Object.values(t.edges))l.from===s&&n.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const s of e)r.has(s.id)||a.push(s);return a}function ue(t,e){typeof window.fbq=="function"&&window.fbq("track",t,e)}function Tt({data:t,settings:e,config:n}){const[i,o]=E(null),[r,a]=E([]),[s,_]=E(null),[l,c]=E({}),[u,f]=E(0),d=W(null),y=W(!1),w=Ct(t),x=w.length;O(()=>{if(y.current)return;y.current=!0;const m=ut(t,n.quizId);c(m);const q=_t(t);if(!q){console.error("[quiz-runtime] No start node found");return}const z=B(t,q.id,null,null,m);if(o(z),!n.preview&&e.providers.metaPixel?.pixelId&&ue("PageView",{}),n.preview)return;const L=ct();pt(n.apiBaseUrl,n.quizId,m,L,t.id??"").then(j=>{_(j),d.current=new dt(j,(We,Qe)=>ft(n.apiBaseUrl,We,Qe)),z&&z.kind==="step"&&d.current.push({event_type:"step_view",step_id:z.id,variant_group_id:z.variantGroupId})}).catch(j=>{console.warn("[quiz-runtime] session start failed:",j)})},[]),O(()=>()=>d.current?.destroy(),[]);const h=U((m,q=!0)=>{if(q&&i&&a(z=>[...z,i]),o(m),m.kind==="step"){const z=w.findIndex(L=>L.id===m.id);z>=0&&f(z),n.preview||d.current?.push({event_type:"step_view",step_id:m.id,variant_group_id:m.variantGroupId})}},[i,w,n.preview]),v=U((m,q)=>{if(!i||i.kind!=="step")return;n.preview||d.current?.push({event_type:"answer",step_id:i.id,variant_group_id:i.variantGroupId,option_id:q,meta:{questionElId:m}});const z=B(t,i.id,q,m,l);z&&h(z)},[i,t,l,h]),I=U(()=>{if(!i||i.kind!=="step")return;const m=B(t,i.id,null,null,l);m&&h(m)},[i,t,l,h]),$=U(()=>{if(!i||i.kind!=="step")return;const m=B(t,i.id,null,null,l);m&&h(m)},[i,t,l,h]),N=U(async m=>{if(!n.preview&&(d.current?.push({event_type:"email_capture",step_id:i?.kind==="step"?i.id:void 0,meta:{email:m}}),e.providers.metaPixel?.pixelId&&ue("Lead",{content_name:e.metadata.title,value:0}),e.providers.klaviyo?.listId&&s))try{await ht(n.apiBaseUrl,s,m,e.providers.klaviyo.listId)}catch(q){console.warn("[quiz-runtime] Klaviyo subscribe failed:",q)}if(i&&i.kind==="step"){const q=B(t,i.id,null,null,l);q&&h(q)}},[i,t,l,h,s,e,n]),Q=U(()=>{n.preview||d.current?.push({event_type:"back",step_id:i?.kind==="step"?i.id:void 0}),a(m=>{if(m.length===0)return m;const q=m[m.length-1],z=m.slice(0,-1);if(o(q),q.kind==="step"){const L=w.findIndex(j=>j.id===q.id);L>=0&&f(L)}return z})},[i,w]),H=U(m=>{if(n.preview){const q=m.redirectUrl||e.redirectUrl||"(no redirect URL)";alert(`[Preview] Would redirect to:
${q}`);return}d.current?.push({event_type:"exit_click"}),e.providers.metaPixel?.pixelId&&ue("CompleteRegistration",{content_name:e.metadata.title,value:0}),d.current?.flush().finally(()=>{const q=m.redirectUrl||e.redirectUrl||"",z=new URL(q,location.href);z.searchParams.set("utm_source","quiz"),z.searchParams.set("utm_campaign",document.title||"quiz"),s&&z.searchParams.set("utm_content",s),location.href=z.toString()})},[e,s,n.preview]);if(i?.kind==="exit"){const m=i;return p("div",{class:"quiz-shell",children:p("div",{class:"quiz-content quiz-exit",children:[p("p",{class:"quiz-text",children:A("loadingResults",n.market)}),p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>H(m),children:A("seeResults",n.market)})]})})}if(!i||i.kind!=="step")return p("div",{class:"quiz-shell",children:p("div",{class:"quiz-content",children:p("div",{class:"quiz-loading",children:p("div",{class:"quiz-loading-spinner"})})})});const M=i,S=e.backNavigation&&r.length>0,T=e.providers.klaviyo?.captureAtStepId;return p("div",{class:"quiz-shell",children:[p("div",{class:"quiz-header",children:[S&&p("button",{class:"quiz-back-btn",type:"button",onClick:Q,"aria-label":"Go back",children:"←"}),e.brandLogo?.enabled&&e.brandLogo.url&&p("img",{src:e.brandLogo.url,alt:"Logo",class:"quiz-logo"}),e.stepProgressCount&&p("span",{class:"quiz-step-count",children:[u+1," / ",x]})]}),e.progressBar&&p(It,{current:u+1,total:x}),p("div",{class:"quiz-content",children:p(St,{node:M,onAnswer:v,onLoadingComplete:I,onEmailSubmit:N,captureAtStepId:T,market:n.market,onContinue:$})})]})}function Te(){const t=window.__QUIZ_DATA__,e=window.__QUIZ_SETTINGS__,n=window.__QUIZ_CONFIG__;if(!t||!e||!n){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}$t(e);const i=document.getElementById("quiz-root");if(!i){console.error("[quiz-runtime] #quiz-root element not found");return}tt(p(Tt,{data:t,settings:e,config:n}),i)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Te):Te();
