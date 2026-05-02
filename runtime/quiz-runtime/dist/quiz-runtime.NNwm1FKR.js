var se,w,De,H,Ce,Re,Ge,de,ee,Q,Ve,be,_e,he,oe={},re=[],lt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ue=Array.isArray;function j(e,t){for(var i in t)e[i]=t[i];return e}function xe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function dt(e,t,i){var n,r,o,s={};for(o in t)o=="key"?n=t[o]:o=="ref"?r=t[o]:s[o]=t[o];if(arguments.length>2&&(s.children=arguments.length>3?se.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(o in e.defaultProps)s[o]===void 0&&(s[o]=e.defaultProps[o]);return te(e,s,n,r,null)}function te(e,t,i,n,r){var o={type:e,props:t,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:r??++De,__i:-1,__u:0};return r==null&&w.vnode!=null&&w.vnode(o),o}function le(e){return e.children}function ie(e,t){this.props=e,this.context=t}function R(e,t){if(t==null)return e.__?R(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?R(e):null}function ct(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,n=[],r=[],o=j({},t);o.__v=t.__v+1,w.vnode&&w.vnode(o),ze(e.__P,o,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,n,i??R(t),!!(32&t.__u),r),o.__v=t.__v,o.__.__k[o.__i]=o,Je(n,o,r),t.__e=t.__=null,o.__e!=i&&We(o)}}function We(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),We(e)}function $e(e){(!e.__d&&(e.__d=!0)&&H.push(e)&&!ae.__r++||Ce!=w.debounceRendering)&&((Ce=w.debounceRendering)||Re)(ae)}function ae(){try{for(var e,t=1;H.length;)H.length>t&&H.sort(Ge),e=H.shift(),t=H.length,ct(e)}finally{H.length=ae.__r=0}}function Qe(e,t,i,n,r,o,s,a,c,l,f){var u,_,p,q,h,v,g,z=n&&n.__k||re,b=t.length;for(c=pt(i,t,z,c,b),u=0;u<b;u++)(p=i.__k[u])!=null&&(_=p.__i!=-1&&z[p.__i]||oe,p.__i=u,v=ze(e,p,_,r,o,s,a,c,l,f),q=p.__e,p.ref&&_.ref!=p.ref&&(_.ref&&qe(_.ref,null,p),f.push(p.ref,p.__c||q,p)),h==null&&q!=null&&(h=q),(g=!!(4&p.__u))||_.__k===p.__k?(c=Ze(p,c,e,g),g&&_.__e&&(_.__e=null)):typeof p.type=="function"&&v!==void 0?c=v:q&&(c=q.nextSibling),p.__u&=-7);return i.__e=h,c}function pt(e,t,i,n,r){var o,s,a,c,l,f=i.length,u=f,_=0;for(e.__k=new Array(r),o=0;o<r;o++)(s=t[o])!=null&&typeof s!="boolean"&&typeof s!="function"?(typeof s=="string"||typeof s=="number"||typeof s=="bigint"||s.constructor==String?s=e.__k[o]=te(null,s,null,null,null):ue(s)?s=e.__k[o]=te(le,{children:s},null,null,null):s.constructor===void 0&&s.__b>0?s=e.__k[o]=te(s.type,s.props,s.key,s.ref?s.ref:null,s.__v):e.__k[o]=s,c=o+_,s.__=e,s.__b=e.__b+1,a=null,(l=s.__i=ft(s,i,c,u))!=-1&&(u--,(a=i[l])&&(a.__u|=2)),a==null||a.__v==null?(l==-1&&(r>f?_--:r<f&&_++),typeof s.type!="function"&&(s.__u|=4)):l!=c&&(l==c-1?_--:l==c+1?_++:(l>c?_--:_++,s.__u|=4))):e.__k[o]=null;if(u)for(o=0;o<f;o++)(a=i[o])!=null&&(2&a.__u)==0&&(a.__e==n&&(n=R(a)),Xe(a,a));return n}function Ze(e,t,i,n){var r,o;if(typeof e.type=="function"){for(r=e.__k,o=0;r&&o<r.length;o++)r[o]&&(r[o].__=e,t=Ze(r[o],t,i,n));return t}e.__e!=t&&(n&&(t&&e.type&&!t.parentNode&&(t=R(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function ft(e,t,i,n){var r,o,s,a=e.key,c=e.type,l=t[i],f=l!=null&&(2&l.__u)==0;if(l===null&&a==null||f&&a==l.key&&c==l.type)return i;if(n>(f?1:0)){for(r=i-1,o=i+1;r>=0||o<t.length;)if((l=t[s=r>=0?r--:o++])!=null&&(2&l.__u)==0&&a==l.key&&c==l.type)return s}return-1}function Ie(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||lt.test(t)?i:i+"px"}function Y(e,t,i,n,r){var o,s;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof n=="string"&&(e.style.cssText=n=""),n)for(t in n)i&&t in i||Ie(e.style,t,"");if(i)for(t in i)n&&i[t]==n[t]||Ie(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")o=t!=(t=t.replace(Ve,"$1")),s=t.toLowerCase(),t=s in e||t=="onFocusOut"||t=="onFocusIn"?s.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+o]=i,i?n?i[Q]=n[Q]:(i[Q]=be,e.addEventListener(t,o?he:_e,o)):e.removeEventListener(t,o?he:_e,o);else{if(r=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function Pe(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[ee]==null)t[ee]=be++;else if(t[ee]<i[Q])return;return i(w.event?w.event(t):t)}}}function ze(e,t,i,n,r,o,s,a,c,l){var f,u,_,p,q,h,v,g,z,b,I,$,X,D,G,A=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(c=!!(32&i.__u),o=[a=t.__e=i.__e]),(f=w.__b)&&f(t);e:if(typeof A=="function")try{if(g=t.props,z=A.prototype&&A.prototype.render,b=(f=A.contextType)&&n[f.__c],I=f?b?b.props.value:f.__:n,i.__c?v=(u=t.__c=i.__c).__=u.__E:(z?t.__c=u=new A(g,I):(t.__c=u=new ie(g,I),u.constructor=A,u.render=ht),b&&b.sub(u),u.state||(u.state={}),u.__n=n,_=u.__d=!0,u.__h=[],u._sb=[]),z&&u.__s==null&&(u.__s=u.state),z&&A.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=j({},u.__s)),j(u.__s,A.getDerivedStateFromProps(g,u.__s))),p=u.props,q=u.state,u.__v=t,_)z&&A.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),z&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(z&&A.getDerivedStateFromProps==null&&g!==p&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(g,I),t.__v==i.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(g,u.__s,I)===!1){t.__v!=i.__v&&(u.props=g,u.state=u.__s,u.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(O){O&&(O.__=t)}),re.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&s.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(g,u.__s,I),z&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(p,q,h)})}if(u.context=I,u.props=g,u.__P=e,u.__e=!1,$=w.__r,X=0,z)u.state=u.__s,u.__d=!1,$&&$(t),f=u.render(u.props,u.state,u.context),re.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,$&&$(t),f=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++X<25);u.state=u.__s,u.getChildContext!=null&&(n=j(j({},n),u.getChildContext())),z&&!_&&u.getSnapshotBeforeUpdate!=null&&(h=u.getSnapshotBeforeUpdate(p,q)),D=f!=null&&f.type===le&&f.key==null?Ke(f.props.children):f,a=Qe(e,ue(D)?D:[D],t,i,n,r,o,s,a,c,l),u.base=t.__e,t.__u&=-161,u.__h.length&&s.push(u),v&&(u.__E=u.__=null)}catch(O){if(t.__v=null,c||o!=null)if(O.then){for(t.__u|=c?160:128;a&&a.nodeType==8&&a.nextSibling;)a=a.nextSibling;o[o.indexOf(a)]=null,t.__e=a}else{for(G=o.length;G--;)xe(o[G]);me(t)}else t.__e=i.__e,t.__k=i.__k,O.then||me(t);w.__e(O,t,i)}else o==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):a=t.__e=_t(i.__e,t,i,n,r,o,s,c,l);return(f=w.diffed)&&f(t),128&t.__u?void 0:a}function me(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(me))}function Je(e,t,i){for(var n=0;n<i.length;n++)qe(i[n],i[++n],i[++n]);w.__c&&w.__c(t,e),e.some(function(r){try{e=r.__h,r.__h=[],e.some(function(o){o.call(r)})}catch(o){w.__e(o,r.__v)}})}function Ke(e){return typeof e!="object"||e==null||e.__b>0?e:ue(e)?e.map(Ke):j({},e)}function _t(e,t,i,n,r,o,s,a,c){var l,f,u,_,p,q,h,v=i.props||oe,g=t.props,z=t.type;if(z=="svg"?r="http://www.w3.org/2000/svg":z=="math"?r="http://www.w3.org/1998/Math/MathML":r||(r="http://www.w3.org/1999/xhtml"),o!=null){for(l=0;l<o.length;l++)if((p=o[l])&&"setAttribute"in p==!!z&&(z?p.localName==z:p.nodeType==3)){e=p,o[l]=null;break}}if(e==null){if(z==null)return document.createTextNode(g);e=document.createElementNS(r,z,g.is&&g),a&&(w.__m&&w.__m(t,o),a=!1),o=null}if(z==null)v===g||a&&e.data==g||(e.data=g);else{if(o=o&&se.call(e.childNodes),!a&&o!=null)for(v={},l=0;l<e.attributes.length;l++)v[(p=e.attributes[l]).name]=p.value;for(l in v)p=v[l],l=="dangerouslySetInnerHTML"?u=p:l=="children"||l in g||l=="value"&&"defaultValue"in g||l=="checked"&&"defaultChecked"in g||Y(e,l,null,p,r);for(l in g)p=g[l],l=="children"?_=p:l=="dangerouslySetInnerHTML"?f=p:l=="value"?q=p:l=="checked"?h=p:a&&typeof p!="function"||v[l]===p||Y(e,l,p,v[l],r);if(f)a||u&&(f.__html==u.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(u&&(e.innerHTML=""),Qe(t.type=="template"?e.content:e,ue(_)?_:[_],t,i,n,z=="foreignObject"?"http://www.w3.org/1999/xhtml":r,o,s,o?o[0]:i.__k&&R(i,0),a,c),o!=null)for(l=o.length;l--;)xe(o[l]);a||(l="value",z=="progress"&&q==null?e.removeAttribute("value"):q!=null&&(q!==e[l]||z=="progress"&&!q||z=="option"&&q!=v[l])&&Y(e,l,q,v[l],r),l="checked",h!=null&&h!=e[l]&&Y(e,l,h,v[l],r))}return e}function qe(e,t,i){try{if(typeof e=="function"){var n=typeof e.__u=="function";n&&e.__u(),n&&t==null||(e.__u=e(t))}else e.current=t}catch(r){w.__e(r,i)}}function Xe(e,t,i){var n,r;if(w.unmount&&w.unmount(e),(n=e.ref)&&(n.current&&n.current!=e.__e||qe(n,null,t)),(n=e.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(o){w.__e(o,t)}n.base=n.__P=null}if(n=e.__k)for(r=0;r<n.length;r++)n[r]&&Xe(n[r],t,i||typeof e.type!="function");i||xe(e.__e),e.__c=e.__=e.__e=void 0}function ht(e,t,i){return this.constructor(e,i)}function mt(e,t,i){var n,r,o,s;t==document&&(t=document.documentElement),w.__&&w.__(e,t),r=(n=!1)?null:t.__k,o=[],s=[],ze(t,e=t.__k=dt(le,null,[e]),r||oe,oe,t.namespaceURI,r?null:t.firstChild?se.call(t.childNodes):null,o,r?r.__e:t.firstChild,n,s),Je(o,e,s)}se=re.slice,w={__e:function(e,t,i,n){for(var r,o,s;t=t.__;)if((r=t.__c)&&!r.__)try{if((o=r.constructor)&&o.getDerivedStateFromError!=null&&(r.setState(o.getDerivedStateFromError(e)),s=r.__d),r.componentDidCatch!=null&&(r.componentDidCatch(e,n||{}),s=r.__d),s)return r.__E=r}catch(a){e=a}throw e}},De=0,ie.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=j({},this.state),typeof e=="function"&&(e=e(j({},i),this.props)),e&&j(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),$e(this))},ie.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),$e(this))},ie.prototype.render=le,H=[],Re=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ge=function(e,t){return e.__v.__b-t.__v.__b},ae.__r=0,de=Math.random().toString(8),ee="__d"+de,Q="__a"+de,Ve=/(PointerCapture)$|Capture$/i,be=0,_e=Pe(!1),he=Pe(!0);var gt=0;function d(e,t,i,n,r,o){t||(t={});var s,a,c=t;if("ref"in c)for(a in c={},t)a=="ref"?s=t[a]:c[a]=t[a];var l={type:e,props:c,key:i,ref:s,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--gt,__i:-1,__u:0,__source:r,__self:o};if(typeof e=="function"&&(s=e.defaultProps))for(a in s)c[a]===void 0&&(c[a]=s[a]);return w.vnode&&w.vnode(l),l}var Z,k,ce,Te,J=0,Ye=[],S=w,Ee=S.__b,Fe=S.__r,Ae=S.diffed,Le=S.__c,je=S.unmount,Ne=S.__;function ve(e,t){S.__h&&S.__h(k,e,J||t),J=0;var i=k.__H||(k.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function P(e){return J=1,bt(it,e)}function bt(e,t,i){var n=ve(Z++,2);if(n.t=e,!n.__c&&(n.__=[it(void 0,t),function(a){var c=n.__N?n.__N[0]:n.__[0],l=n.t(c,a);c!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=k,!k.__f)){var r=function(a,c,l){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(_){return _.__c});if(f.every(function(_){return!_.__N}))return!o||o.call(this,a,c,l);var u=n.__c.props!==a;return f.some(function(_){if(_.__N){var p=_.__[0];_.__=_.__N,_.__N=void 0,p!==_.__[0]&&(u=!0)}}),o&&o.call(this,a,c,l)||u};k.__f=!0;var o=k.shouldComponentUpdate,s=k.componentWillUpdate;k.componentWillUpdate=function(a,c,l){if(this.__e){var f=o;o=void 0,r(a,c,l),o=f}s&&s.call(this,a,c,l)},k.shouldComponentUpdate=r}return n.__N||n.__}function E(e,t){var i=ve(Z++,3);!S.__s&&tt(i.__H,t)&&(i.__=e,i.u=t,k.__H.__h.push(i))}function N(e){return J=5,et(function(){return{current:e}},[])}function et(e,t){var i=ve(Z++,7);return tt(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function U(e,t){return J=8,et(function(){return e},t)}function xt(){for(var e;e=Ye.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(ne),t.__h.some(ge),t.__h=[]}catch(i){t.__h=[],S.__e(i,e.__v)}}}S.__b=function(e){k=null,Ee&&Ee(e)},S.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Ne&&Ne(e,t)},S.__r=function(e){Fe&&Fe(e),Z=0;var t=(k=e.__c).__H;t&&(ce===k?(t.__h=[],k.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(ne),t.__h.some(ge),t.__h=[],Z=0)),ce=k},S.diffed=function(e){Ae&&Ae(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(Ye.push(t)!==1&&Te===S.requestAnimationFrame||((Te=S.requestAnimationFrame)||zt)(xt)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),ce=k=null},S.__c=function(e,t){t.some(function(i){try{i.__h.some(ne),i.__h=i.__h.filter(function(n){return!n.__||ge(n)})}catch(n){t.some(function(r){r.__h&&(r.__h=[])}),t=[],S.__e(n,i.__v)}}),Le&&Le(e,t)},S.unmount=function(e){je&&je(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(n){try{ne(n)}catch(r){t=r}}),i.__H=void 0,t&&S.__e(t,i.__v))};var Oe=typeof requestAnimationFrame=="function";function zt(e){var t,i=function(){clearTimeout(n),Oe&&cancelAnimationFrame(t),setTimeout(e)},n=setTimeout(i,35);Oe&&(t=requestAnimationFrame(i))}function ne(e){var t=k,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),k=t}function ge(e){var t=k;e.__c=e.__(),k=t}function tt(e,t){return!e||e.length!==t.length||t.some(function(i,n){return i!==e[n]})}function it(e,t){return typeof t=="function"?t(e):t}function qt(e){const t=e.reduce((n,r)=>n+(r.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const n of e)if(i-=n.trafficPct??0,i<=0)return n;return e[e.length-1]}function vt(e,t){const i={};for(const r of Object.values(e.nodes)){if(r.kind!=="step"||!r.variantGroupId)continue;const o=r.variantGroupId;i[o]||(i[o]=[]),i[o].push(r)}const n={};for(const[r,o]of Object.entries(i)){const s=`quiz_${t}_vg_${r}`,a=localStorage.getItem(s);if(a&&e.nodes[a])n[r]=a;else{const c=qt(o);localStorage.setItem(s,c.id),n[r]=c.id}}return n}function yt(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function wt(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function B(e,t,i,n,r){const o=yt(e,t);if(o.length===0)return null;if(i!==null){const a=o.find(c=>wt(c.condition,i,n));if(a)return Ue(e,a.to,r)}const s=o.find(a=>!a.condition||a.condition.kind==="default")??o[0];return Ue(e,s.to,r)}function Ue(e,t,i){const n=e.nodes[t];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const r=i[n.variantGroupId];if(r)return e.nodes[r]??n}return n}function kt(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function St(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const r=e.get(n);r&&(t[n]=r)}return t}class Ct{constructor(t,i){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function $t(e,t,i,n,r){const o=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:n,ua:navigator.userAgent,market:r})});if(!o.ok)throw new Error(`session start failed: ${o.status}`);return(await o.json()).session_id}async function It(e,t,i){const n={session_id:t,events:i.map(o=>({event_type:o.event_type,step_id:o.step_id,variant_group_id:o.variant_group_id,option_id:o.option_id,meta:o.meta}))},r=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!r.ok)throw new Error(`events flush failed: ${r.status}`)}async function Pt(e,t,i,n){const r=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:n})});if(!r.ok)throw new Error(`klaviyo subscribe failed: ${r.status}`)}const Tt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function L(e,t){const i=t??"en",n=Tt[e];return i in n?n[i]:n.en}function nt(e){if(!e)return;const t=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const r=n.split(";").map(o=>o.trim()).filter(o=>/^color\s*:/i.test(o)).join("; ");r?i.setAttribute("style",r):i.removeAttribute("style")}for(const r of Array.from(i.children))t(r)};for(const i of Array.from(e.children))t(i)}function pe(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Et(e){if(!e)return e;const t=e.slice(-1).toLowerCase();return t==="s"||t==="x"||t==="z"?e:e+"s"}const He={name:"Din valp",breed:"din valp",primary_pain:"beteendeproblem",upcoming_event_value:"",time_per_day:"10 min/dag"};function Me(e,t){if(t!=null&&t.trim()!=="")return t;if(e in He)return He[e]}function K(e,t){return e.includes("{")?e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{if(n.endsWith("_pos")){const s=n.slice(0,-4),a=t?.[s],c=Me(s,a);return c==null?i:pe(c==="Din valp"?"Din valps":Et(c))}const r=t?.[n],o=Me(n,r);return o==null?i:pe(o)}):e}function Ft({el:e,variables:t}){const i=N(null),n=K(e.text,t);return E(()=>{i.current&&(i.current.innerHTML=n,nt(i.current))},[n]),d("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function At({el:e,variables:t}){const i=N(null),n=K(e.text,t);return E(()=>{i.current&&(i.current.innerHTML=n,nt(i.current))},[n]),d("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function Lt({el:e}){return d("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function jt({el:e,variables:t,onVariableChange:i}){const[n,r]=P(t?.[e.variable]??"");E(()=>{i?.(e.variable,n)},[n,e.variable,i]);const o=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return d("input",{type:o,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:n,min:e.min,max:e.max,onInput:s=>r(s.target.value)})}function Nt({el:e,variables:t,onVariableChange:i}){const[n,r]=P(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));E(()=>{i?.(e.variable,String(n))},[n,e.variable,i]);const o=e.unit??"",s=(n-e.min)/(e.max-e.min)*100;return d("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-range-value",children:[n,o&&` ${o}`]}),d("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:n,style:`--quiz-range-pct: ${s}%`,onInput:a=>r(Number(a.target.value))}),d("div",{class:"quiz-range-bounds",children:[d("span",{children:[e.min,o&&` ${o}`]}),d("span",{children:[e.max,o&&` ${o}`]})]})]})}function Ot({el:e}){const[t,i]=P(0),n=e.items.length;if(n===0)return null;const r=e.items[t],o=()=>i(a=>(a+1)%n),s=()=>i(a=>(a-1+n)%n);return d("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-testimonial-card",children:[r.avatar&&d("img",{src:r.avatar,alt:r.name,class:"quiz-testimonial-avatar"}),d("div",{class:"quiz-testimonial-body",children:[d("div",{class:"quiz-testimonial-name",children:r.name}),typeof r.rating=="number"&&d("div",{class:"quiz-testimonial-rating","aria-label":`${r.rating} stars`,children:["★".repeat(Math.round(r.rating)),d("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(r.rating)))})]}),d("div",{class:"quiz-testimonial-text",children:r.text})]})]}),n>1&&d("div",{class:"quiz-testimonial-nav",children:[d("button",{type:"button",class:"quiz-testimonial-prev",onClick:s,"aria-label":"Previous",children:"←"}),d("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(a,c)=>d("button",{type:"button",class:`quiz-testimonial-dot${c===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(c),"aria-label":`Go to testimonial ${c+1}`},c))}),d("button",{type:"button",class:"quiz-testimonial-next",onClick:o,"aria-label":"Next",children:"→"})]})]})}function Ut(e){let t="",i="'Quicksand', system-ui, -apple-system, sans-serif",n="#1A1A1A",r="transparent";if(typeof window<"u"&&typeof document<"u"){const o=getComputedStyle(document.documentElement),s=(c,l)=>o.getPropertyValue(c).trim()||l;i=s("--quiz-font",i),n=s("--quiz-text-primary",n),r=s("--quiz-bg",r),t=["--quiz-bg","--quiz-text-primary","--quiz-text-secondary","--quiz-brand","--quiz-option-bg","--quiz-option-border","--quiz-option-selected-bg","--quiz-option-radius","--quiz-option-padding","--quiz-option-border-width","--quiz-cta-radius","--quiz-cta-padding","--quiz-step-gap","--quiz-font"].map(c=>`  ${c}: ${s(c,"").trim()||"initial"};`).join(`
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
  background: ${r};
  -webkit-font-smoothing: antialiased;
}
body { padding: 0; margin: 0; }
</style>
</head>
<body>${e}</body>
</html>`}function Ht(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function Mt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const n of Array.from(e.querySelectorAll(i)))n.parentNode?.removeChild(n);e.innerText.trim().length===0&&(e.style.display="none")}function Bt({el:e,variables:t}){const i=N(null),n=N(null),r=K(e.html,t),o=Ht(r);if(E(()=>{o||!i.current||(i.current.innerHTML=r,Mt(i.current))},[r,o]),E(()=>{if(!o||!n.current)return;const s=n.current;let a=null,c=0;const l=()=>{try{const u=s.contentDocument;if(!u)return;const _=u.documentElement?.scrollHeight??0;_>0&&(s.style.height=_+"px")}catch{}},f=()=>{l(),c=requestAnimationFrame(l);try{const u=s.contentDocument;u&&typeof ResizeObserver<"u"&&(a=new ResizeObserver(l),a.observe(u.documentElement))}catch{}};return s.addEventListener("load",f),f(),()=>{s.removeEventListener("load",f),a?.disconnect(),c&&cancelAnimationFrame(c)}},[r,o]),o){const s=Ut(r);return d("iframe",{ref:n,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:s,title:`Custom block ${e.id}`})}return d("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function Dt({el:e,onComplete:t,variables:i}){E(()=>{const r=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(r)},[e.seconds,t]);const n=K(e.text??"",i);return d("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[d("div",{class:"quiz-loading-spinner"}),n&&d("p",{class:"quiz-loading-text",children:n})]})}function Rt({option:e,layout:t,selected:i,onClick:n,variables:r,kindOf:o}){const s=["quiz-option",`quiz-option--${t}`,o==="multi"?"quiz-option--multi":"",i?"quiz-option--selected":""].filter(Boolean).join(" "),a=K(e.label,r),c=o==="multi"&&(t==="list"||t==="cards"||t==="image_cards"),l=o==="single"&&(t==="list"||t==="cards"||t==="image_cards");return d("button",{class:s,"data-quiz-opt-id":e.id,onClick:n,type:"button",children:[t==="image_cards"&&e.imageUrl&&d("img",{src:e.imageUrl,alt:a,class:"quiz-option-img"}),t==="image_cards"&&!e.imageUrl&&e.imageDescription&&d("span",{class:"quiz-option-img-placeholder",title:e.imageDescription,children:d("span",{class:"quiz-option-img-placeholder-label",children:e.imageDescription})}),e.emoji&&d("span",{class:"quiz-option-emoji",children:e.emoji}),d("span",{class:"quiz-option-label",children:a}),l&&d("span",{class:"quiz-option-arrow","aria-hidden":"true",children:d("svg",{viewBox:"0 0 20 20",width:"16",height:"16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M7 5L13 10L7 15",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"})})}),c&&d("span",{class:`quiz-option-checkbox${i?" quiz-option-checkbox--checked":""}`,"aria-hidden":"true",children:i&&d("svg",{viewBox:"0 0 20 20",width:"14",height:"14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M4 10.5L8 14.5L16 6.5",stroke:"#FFFFFF","stroke-width":"2.5","stroke-linecap":"round","stroke-linejoin":"round"})})})]})}function Gt({el:e,onAnswer:t,market:i,variables:n}){const[r,o]=P(new Set),s=c=>{e.kindOf==="single"?(o(new Set([c])),e.layout!=="dropdown"&&setTimeout(()=>t(e.id,c),200)):o(l=>{const f=new Set(l);return f.has(c)?f.delete(c):f.add(c),f})};if(e.layout==="dropdown")return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:"quiz-question quiz-question--dropdown",children:[d(Vt,{el:e,selected:r,onPick:c=>s(c),market:i}),r.size>0&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>t(e.id,[...r][0]),children:[L("continue",i),e.kindOf==="multi"?` (${r.size})`:""]}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]});const a=e.escapeOption?e.options.filter(c=>c.id!==e.escapeOption.optionId):e.options;return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[a.map(c=>d(Rt,{option:c,layout:e.layout,selected:r.has(c.id),onClick:()=>s(c.id),variables:n,kindOf:e.kindOf},c.id)),(e.kindOf==="multi"||e.kindOf==="single"&&e.escapeOption)&&d("div",{class:"quiz-question-bottom",children:[e.kindOf==="multi"&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",disabled:r.size===0,onClick:()=>{if(r.size===0)return;const c=[...r][0];t(e.id,c)},children:L("continue",i)}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]})]})}function Vt({el:e,selected:t,onPick:i,market:n}){const r=e.kindOf==="multi",o=e.options.filter(b=>t.has(b.id)),s=o.length>0,a=!r&&s?o[0].label:"",[c,l]=P(a),[f,u]=P(!1),_=N(null),p=N(null);E(()=>{const b=I=>{_.current&&!_.current.contains(I.target)&&u(!1)};return document.addEventListener("mousedown",b),()=>document.removeEventListener("mousedown",b)},[]);const q=c.trim().toLowerCase(),h=!r&&s&&o[0].label.toLowerCase()===q,v=q?e.options.filter(b=>b.label.toLowerCase().includes(q)):e.options,g=f&&!h,z=e.dropdownPlaceholder||(e.searchable?L("searchPlaceholder",n):L("selectPlaceholder",n));return d("div",{class:`quiz-dropdown${f?" quiz-dropdown--open":""}${r?" quiz-dropdown--multi":""}`,ref:_,children:[r&&s&&d("div",{class:"quiz-dropdown-chips quiz-dropdown-chips--stack",children:[o.slice(0,4).map(b=>d("span",{class:"quiz-dropdown-chip",children:b.label},b.id)),o.length>4&&d("span",{class:"quiz-dropdown-chip quiz-dropdown-chip--more",children:["+",o.length-4]})]}),d("input",{ref:p,type:"text",class:"quiz-dropdown-input",placeholder:z,value:c,autoComplete:"off",autoCapitalize:"words",spellcheck:!1,onFocus:()=>u(!0),onInput:b=>{l(b.target.value),u(!0)}}),g&&d("ul",{class:"quiz-dropdown-list",children:[v.length===0&&d("li",{class:"quiz-dropdown-empty",children:L("noMatches",n)}),v.slice(0,50).map(b=>{const I=t.has(b.id);return d("li",{children:d("button",{type:"button",class:`quiz-dropdown-item${I?" quiz-dropdown-item--selected":""}`,"data-quiz-opt-id":b.id,onMouseDown:$=>{$.preventDefault()},onClick:()=>{i(b.id),r?(l(""),p.current?.focus()):(l(b.label),u(!1),p.current?.blur())},children:[r&&d("span",{class:`quiz-dropdown-check${I?" quiz-dropdown-check--on":""}`,"aria-hidden":"true",children:I?"✓":""}),b.emoji&&d("span",{class:"quiz-dropdown-emoji",children:b.emoji}),b.label]})},b.id)})]})]})}function Wt({onSubmit:e,market:t}){const[i,n]=P(""),[r,o]=P("");return d("form",{class:"quiz-email-form",onSubmit:a=>{if(a.preventDefault(),!i.includes("@")){o(L("invalidEmail",t));return}o(""),e(i)},novalidate:!0,children:[d("input",{type:"email",class:"quiz-email-input",placeholder:L("emailPlaceholder",t),value:i,onInput:a=>n(a.target.value),required:!0}),r&&d("p",{class:"quiz-email-error",children:r}),d("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:L("continue",t)})]})}function Qt({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:r,market:o,onContinue:s,variables:a,onVariableChange:c}){const l=e.subEls.some(h=>h.kind==="question"),f=e.subEls.some(h=>h.kind==="loading"),u=!!e.name&&/^commit/i.test(e.name),_=!l&&!f&&!u&&typeof s=="function",p=e.subEls.filter(h=>h.kind==="text_input"),q=_&&p.length>0&&p.some(h=>{const v=a?.[h.variable];return v==null||v.trim().length===0});return d("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(h=>{switch(h.kind){case"title":return d(Ft,{el:h,variables:a},h.id);case"text":return d(At,{el:h,variables:a},h.id);case"image":return d(Lt,{el:h},h.id);case"custom_html":return d(Bt,{el:h,variables:a},h.id);case"loading":return d(Dt,{el:h,onComplete:i,variables:a},h.id);case"question":return d(Gt,{el:h,onAnswer:t,market:o,variables:a},h.id);case"text_input":return d(jt,{el:h,variables:a,onVariableChange:c},h.id);case"range_slider":return d(Nt,{el:h,variables:a,onVariableChange:c},h.id);case"testimonial_slider":return d(Ot,{el:h},h.id)}}),r===e.id&&d(Wt,{onSubmit:n,market:o}),_&&d("div",{class:"quiz-continue-wrap","data-step-name":e.name??"",children:d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:s,disabled:q,children:L("continue",o)})})]})}function Zt({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return d("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:d("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Jt(e){const{brandColors:t,fontSettings:i}=e,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const s=document.createElement("link");s.rel="stylesheet",s.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(s)}const r=e.design??{},o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${t.background};
  --quiz-text-primary: ${t.textPrimary};
  --quiz-text-secondary: ${t.textSecondary};
  --quiz-brand: ${t.primaryBrand};
  --quiz-option-bg: ${t.optionBackground};
  --quiz-option-border: ${t.optionBorder??"rgba(107, 114, 128, 0.3)"};
  --quiz-option-selected-bg: ${t.optionSelectedBg??`color-mix(in srgb, ${t.primaryBrand} 10%, transparent)`};
  --quiz-option-radius: ${r.optionRadius??"16px"};
  --quiz-option-padding: ${r.optionPadding??"16px"};
  --quiz-option-border-width: ${r.optionBorderWidth??"2px"};
  --quiz-cta-radius: ${r.ctaRadius??"12px"};
  --quiz-cta-padding: ${r.ctaPadding??"16px 40px"};
  --quiz-step-gap: ${r.stepGap??"20px"};
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
  bottom: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
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
 * (William 2026-04-30). */
.quiz-continue-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
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
  `,document.head.appendChild(o)}function Kt(e){const t=Object.values(e.nodes).filter(a=>a.kind==="step"),i=new Set(t.map(a=>a.id)),n=Object.values(e.nodes).find(a=>a.kind==="start"),r=[];if(n)for(const a of Object.values(e.edges))a.from===n.id&&i.has(a.to)&&r.push(a.to);else for(const a of t)r.push(a.id);const o=new Set,s=[];for(;r.length;){const a=r.shift();if(o.has(a))continue;o.add(a);const c=e.nodes[a];c&&c.kind==="step"&&s.push(c);for(const l of Object.values(e.edges))l.from===a&&i.has(l.to)&&!o.has(l.to)&&r.push(l.to)}for(const a of t)o.has(a.id)||s.push(a);return s}function Xt({node:e,onTrigger:t}){const i=N(!1);return E(()=>{i.current||(i.current=!0,t(e))},[e,t]),null}function fe(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function Yt({data:e,settings:t,config:i}){const[n,r]=P(null),[o,s]=P([]),[a,c]=P(null),[l,f]=P({}),[u,_]=P(0),[p,q]=P(null),[h,v]=P({}),g=N(null),z=N(!1);E(()=>{if(!p)return;const m=setTimeout(()=>q(null),4e3);return()=>clearTimeout(m)},[p]);const b=Kt(e),I=b.length;E(()=>{if(z.current)return;z.current=!0;const m=vt(e,i.quizId);f(m);const y=kt(e);if(!y){console.error("[quiz-runtime] No start node found");return}let x=B(e,y.id,null,null,m);try{const C=new URLSearchParams(location.search),F=C.get("goto");if(F&&F.trim()){const M=F.trim().toLowerCase(),V=Object.values(e.nodes).find(W=>W.kind==="step"&&(W.name??"").toLowerCase().includes(M));if(V){x=V;const W={name:"Bella",name_pos:"Bellas",gender:"Hane",gender_value:"han",breed:"Golden retriever",primary_pain:"Drar i kopplet",primary_pain_value:"koppeldragning",age:"7-12 mån",time_per_day:"10 min/dag",ignores_owner_value:"Spridd",seeks_affection_value:"Stark"},we=C.get("vars");we&&we.split(",").forEach(ut=>{const[ke,Se]=ut.split(":");ke&&Se&&(W[ke.trim()]=Se.trim())}),v(W),console.info(`[quiz-runtime] goto=${F} → ${V.id} (${V.kind==="step"?V.name:""})`)}else console.warn(`[quiz-runtime] goto=${F} no match`)}}catch{}if(r(x),!i.preview&&t.providers.metaPixel?.pixelId&&fe("PageView",{}),i.preview)return;const T=St();$t(i.apiBaseUrl,i.quizId,m,T,e.id??"").then(C=>{c(C),g.current=new Ct(C,(F,M)=>It(i.apiBaseUrl,F,M)),x&&x.kind==="step"&&g.current.push({event_type:"step_view",step_id:x.id,variant_group_id:x.variantGroupId})}).catch(C=>{console.warn("[quiz-runtime] session start failed:",C)})},[]),E(()=>()=>g.current?.destroy(),[]),E(()=>{const m=y=>{const x=y.data;if(!x||typeof x!="object"||x.type!=="quiz-runtime-continue"||!n||n.kind!=="step")return;i.preview||g.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof x.value=="string"?x.value:"yes",meta:{source:"commit_gate_modal"}});const T=B(e,n.id,null,null,l);T&&$(T)};return window.addEventListener("message",m),()=>window.removeEventListener("message",m)},[n,e,l,i.preview]),E(()=>{if(!n||n.kind!=="step")return;const m=n;if(m.subEls.length===0){const y=B(e,m.id,null,null,l);y&&y.id!==n.id&&$(y,!1)}},[n]);const $=U((m,y=!0)=>{if(y&&n&&s(x=>[...x,n]),r(m),m.kind==="step"){const x=b.findIndex(T=>T.id===m.id);x>=0&&_(x),i.preview||g.current?.push({event_type:"step_view",step_id:m.id,variant_group_id:m.variantGroupId})}},[n,b,i.preview]),X=U((m,y)=>{if(!n||n.kind!=="step")return;const x=n.subEls.find(C=>C.id===m&&C.kind==="question");if(x&&x.kind==="question"&&x.variable){const C=x.options.find(F=>F.id===y);C&&v(F=>({...F,[x.variable]:C.label,...C.value!==void 0?{[`${x.variable}_value`]:C.value}:{}}))}i.preview||g.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:y,meta:{questionElId:m}});const T=B(e,n.id,y,m,l);T&&$(T)},[n,e,l,$]),D=U((m,y)=>{v(x=>({...x,[m]:y}))},[]),G=U(()=>{if(!n||n.kind!=="step")return;const m=B(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),A=U(()=>{if(!n||n.kind!=="step")return;const m=B(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),O=U(async m=>{if(!i.preview&&(g.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:m}}),t.providers.metaPixel?.pixelId&&fe("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&a))try{await Pt(i.apiBaseUrl,a,m,t.providers.klaviyo.listId)}catch(y){console.warn("[quiz-runtime] Klaviyo subscribe failed:",y)}if(n&&n.kind==="step"){const y=B(e,n.id,null,null,l);y&&$(y)}},[n,e,l,$,a,t,i]),ot=U(()=>{i.preview||g.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),s(m=>{if(m.length===0)return m;const y=m[m.length-1],x=m.slice(0,-1);if(r(y),y.kind==="step"){const T=b.findIndex(C=>C.id===y.id);T>=0&&_(T)}return x})},[n,b]),rt=U(m=>{if(i.preview){const M=m.redirectUrl||t.redirectUrl||"(no redirect URL)";q(`[Preview] Would redirect to: ${M}`);return}g.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&fe("CompleteRegistration",{content_name:t.metadata.title,value:0});const y=m.redirectUrl||t.redirectUrl||"",x=new URL(y,location.href);x.searchParams.set("utm_source","quiz"),x.searchParams.set("utm_campaign",document.title||"quiz"),a&&x.searchParams.set("utm_content",a);const T=x.toString(),C=g.current?.flush().catch(()=>{})??Promise.resolve(),F=new Promise(M=>setTimeout(M,1500));Promise.race([C,F]).finally(()=>{location.href=T})},[t,a,i.preview]);if(n?.kind==="exit")return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-content quiz-exit",children:[d(Xt,{node:n,onTrigger:rt}),d("div",{class:"quiz-loading-spinner"}),d("p",{class:"quiz-text",children:L("loadingResults",i.market)})]}),p&&d("div",{class:"quiz-preview-toast",children:p})]});if(!n||n.kind!=="step")return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content",children:d("div",{class:"quiz-loading",children:d("div",{class:"quiz-loading-spinner"})})})});const ye=n,at=t.backNavigation&&o.length>0,st=t.providers.klaviyo?.captureAtStepId;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-header",children:[d("div",{class:"quiz-header-side quiz-header-side--start",children:at&&d("button",{class:"quiz-back-btn",type:"button",onClick:ot,"aria-label":"Go back",children:"←"})}),t.brandLogo?.enabled&&t.brandLogo.url&&d("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),d("div",{class:"quiz-header-side quiz-header-side--end",children:t.stepProgressCount&&d("span",{class:"quiz-step-count",children:[u+1," / ",I]})})]}),t.progressBar&&d(Zt,{current:u+1,total:I}),d("div",{class:"quiz-content",children:d(Qt,{node:ye,onAnswer:X,onLoadingComplete:G,onEmailSubmit:O,captureAtStepId:st,market:i.market,onContinue:A,variables:h,onVariableChange:D},ye.id)})]})}function Be(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Jt(t);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}mt(d(Yt,{data:e,settings:t,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Be):Be();
