var nt,x,Et,H,vt,Nt,At,st,J,R,Ut,pt,lt,ct,tt={},et=[],te=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,rt=Array.isArray;function A(t,e){for(var i in e)t[i]=e[i];return t}function ft(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function ee(t,e,i){var n,o,r,u={};for(r in e)r=="key"?n=e[r]:r=="ref"?o=e[r]:u[r]=e[r];if(arguments.length>2&&(u.children=arguments.length>3?nt.call(arguments,2):i),typeof t=="function"&&t.defaultProps!=null)for(r in t.defaultProps)u[r]===void 0&&(u[r]=t.defaultProps[r]);return K(t,u,n,o,null)}function K(t,e,i,n,o){var r={type:t,props:e,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Et,__i:-1,__u:0};return o==null&&x.vnode!=null&&x.vnode(r),r}function ot(t){return t.children}function Y(t,e){this.props=t,this.context=e}function O(t,e){if(e==null)return t.__?O(t.__,t.__i+1):null;for(var i;e<t.__k.length;e++)if((i=t.__k[e])!=null&&i.__e!=null)return i.__e;return typeof t.type=="function"?O(t):null}function ie(t){if(t.__P&&t.__d){var e=t.__v,i=e.__e,n=[],o=[],r=A({},e);r.__v=e.__v+1,x.vnode&&x.vnode(r),ht(t.__P,r,e,t.__n,t.__P.namespaceURI,32&e.__u?[i]:null,n,i??O(e),!!(32&e.__u),o),r.__v=e.__v,r.__.__k[r.__i]=r,Ft(n,r,o),e.__e=e.__=null,r.__e!=i&&jt(r)}}function jt(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),jt(t)}function xt(t){(!t.__d&&(t.__d=!0)&&H.push(t)&&!it.__r++||vt!=x.debounceRendering)&&((vt=x.debounceRendering)||Nt)(it)}function it(){try{for(var t,e=1;H.length;)H.length>e&&H.sort(At),t=H.shift(),e=H.length,ie(t)}finally{H.length=it.__r=0}}function Ht(t,e,i,n,o,r,u,s,d,l,f){var a,_,p,z,$,y,m,g=n&&n.__k||et,S=e.length;for(d=ne(i,e,g,d,S),a=0;a<S;a++)(p=i.__k[a])!=null&&(_=p.__i!=-1&&g[p.__i]||tt,p.__i=a,y=ht(t,p,_,o,r,u,s,d,l,f),z=p.__e,p.ref&&_.ref!=p.ref&&(_.ref&&mt(_.ref,null,p),f.push(p.ref,p.__c||z,p)),$==null&&z!=null&&($=z),(m=!!(4&p.__u))||_.__k===p.__k?(d=Lt(p,d,t,m),m&&_.__e&&(_.__e=null)):typeof p.type=="function"&&y!==void 0?d=y:z&&(d=z.nextSibling),p.__u&=-7);return i.__e=$,d}function ne(t,e,i,n,o){var r,u,s,d,l,f=i.length,a=f,_=0;for(t.__k=new Array(o),r=0;r<o;r++)(u=e[r])!=null&&typeof u!="boolean"&&typeof u!="function"?(typeof u=="string"||typeof u=="number"||typeof u=="bigint"||u.constructor==String?u=t.__k[r]=K(null,u,null,null,null):rt(u)?u=t.__k[r]=K(ot,{children:u},null,null,null):u.constructor===void 0&&u.__b>0?u=t.__k[r]=K(u.type,u.props,u.key,u.ref?u.ref:null,u.__v):t.__k[r]=u,d=r+_,u.__=t,u.__b=t.__b+1,s=null,(l=u.__i=re(u,i,d,a))!=-1&&(a--,(s=i[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(o>f?_--:o<f&&_++),typeof u.type!="function"&&(u.__u|=4)):l!=d&&(l==d-1?_--:l==d+1?_++:(l>d?_--:_++,u.__u|=4))):t.__k[r]=null;if(a)for(r=0;r<f;r++)(s=i[r])!=null&&(2&s.__u)==0&&(s.__e==n&&(n=O(s)),Ot(s,s));return n}function Lt(t,e,i,n){var o,r;if(typeof t.type=="function"){for(o=t.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=t,e=Lt(o[r],e,i,n));return e}t.__e!=e&&(n&&(e&&t.type&&!e.parentNode&&(e=O(t)),i.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function re(t,e,i,n){var o,r,u,s=t.key,d=t.type,l=e[i],f=l!=null&&(2&l.__u)==0;if(l===null&&s==null||f&&s==l.key&&d==l.type)return i;if(n>(f?1:0)){for(o=i-1,r=i+1;o>=0||r<e.length;)if((l=e[u=o>=0?o--:r++])!=null&&(2&l.__u)==0&&s==l.key&&d==l.type)return u}return-1}function bt(t,e,i){e[0]=="-"?t.setProperty(e,i??""):t[e]=i==null?"":typeof i!="number"||te.test(e)?i:i+"px"}function Z(t,e,i,n,o){var r,u;t:if(e=="style")if(typeof i=="string")t.style.cssText=i;else{if(typeof n=="string"&&(t.style.cssText=n=""),n)for(e in n)i&&e in i||bt(t.style,e,"");if(i)for(e in i)n&&i[e]==n[e]||bt(t.style,e,i[e])}else if(e[0]=="o"&&e[1]=="n")r=e!=(e=e.replace(Ut,"$1")),u=e.toLowerCase(),e=u in t||e=="onFocusOut"||e=="onFocusIn"?u.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+r]=i,i?n?i[R]=n[R]:(i[R]=pt,t.addEventListener(e,r?ct:lt,r)):t.removeEventListener(e,r?ct:lt,r);else{if(o=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=i??"";break t}catch{}typeof i=="function"||(i==null||i===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&i==1?"":i))}}function zt(t){return function(e){if(this.l){var i=this.l[e.type+t];if(e[J]==null)e[J]=pt++;else if(e[J]<i[R])return;return i(x.event?x.event(e):e)}}}function ht(t,e,i,n,o,r,u,s,d,l){var f,a,_,p,z,$,y,m,g,S,P,k,Q,F,B,I=e.type;if(e.constructor!==void 0)return null;128&i.__u&&(d=!!(32&i.__u),r=[s=e.__e=i.__e]),(f=x.__b)&&f(e);t:if(typeof I=="function")try{if(m=e.props,g=I.prototype&&I.prototype.render,S=(f=I.contextType)&&n[f.__c],P=f?S?S.props.value:f.__:n,i.__c?y=(a=e.__c=i.__c).__=a.__E:(g?e.__c=a=new I(m,P):(e.__c=a=new Y(m,P),a.constructor=I,a.render=se),S&&S.sub(a),a.state||(a.state={}),a.__n=n,_=a.__d=!0,a.__h=[],a._sb=[]),g&&a.__s==null&&(a.__s=a.state),g&&I.getDerivedStateFromProps!=null&&(a.__s==a.state&&(a.__s=A({},a.__s)),A(a.__s,I.getDerivedStateFromProps(m,a.__s))),p=a.props,z=a.state,a.__v=e,_)g&&I.getDerivedStateFromProps==null&&a.componentWillMount!=null&&a.componentWillMount(),g&&a.componentDidMount!=null&&a.__h.push(a.componentDidMount);else{if(g&&I.getDerivedStateFromProps==null&&m!==p&&a.componentWillReceiveProps!=null&&a.componentWillReceiveProps(m,P),e.__v==i.__v||!a.__e&&a.shouldComponentUpdate!=null&&a.shouldComponentUpdate(m,a.__s,P)===!1){e.__v!=i.__v&&(a.props=m,a.state=a.__s,a.__d=!1),e.__e=i.__e,e.__k=i.__k,e.__k.some(function(U){U&&(U.__=e)}),et.push.apply(a.__h,a._sb),a._sb=[],a.__h.length&&u.push(a);break t}a.componentWillUpdate!=null&&a.componentWillUpdate(m,a.__s,P),g&&a.componentDidUpdate!=null&&a.__h.push(function(){a.componentDidUpdate(p,z,$)})}if(a.context=P,a.props=m,a.__P=t,a.__e=!1,k=x.__r,Q=0,g)a.state=a.__s,a.__d=!1,k&&k(e),f=a.render(a.props,a.state,a.context),et.push.apply(a.__h,a._sb),a._sb=[];else do a.__d=!1,k&&k(e),f=a.render(a.props,a.state,a.context),a.state=a.__s;while(a.__d&&++Q<25);a.state=a.__s,a.getChildContext!=null&&(n=A(A({},n),a.getChildContext())),g&&!_&&a.getSnapshotBeforeUpdate!=null&&($=a.getSnapshotBeforeUpdate(p,z)),F=f!=null&&f.type===ot&&f.key==null?Mt(f.props.children):f,s=Ht(t,rt(F)?F:[F],e,i,n,o,r,u,s,d,l),a.base=e.__e,e.__u&=-161,a.__h.length&&u.push(a),y&&(a.__E=a.__=null)}catch(U){if(e.__v=null,d||r!=null)if(U.then){for(e.__u|=d?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,e.__e=s}else{for(B=r.length;B--;)ft(r[B]);dt(e)}else e.__e=i.__e,e.__k=i.__k,U.then||dt(e);x.__e(U,e,i)}else r==null&&e.__v==i.__v?(e.__k=i.__k,e.__e=i.__e):s=e.__e=oe(i.__e,e,i,n,o,r,u,d,l);return(f=x.diffed)&&f(e),128&e.__u?void 0:s}function dt(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(dt))}function Ft(t,e,i){for(var n=0;n<i.length;n++)mt(i[n],i[++n],i[++n]);x.__c&&x.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(r){r.call(o)})}catch(r){x.__e(r,o.__v)}})}function Mt(t){return typeof t!="object"||t==null||t.__b>0?t:rt(t)?t.map(Mt):A({},t)}function oe(t,e,i,n,o,r,u,s,d){var l,f,a,_,p,z,$,y=i.props||tt,m=e.props,g=e.type;if(g=="svg"?o="http://www.w3.org/2000/svg":g=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((p=r[l])&&"setAttribute"in p==!!g&&(g?p.localName==g:p.nodeType==3)){t=p,r[l]=null;break}}if(t==null){if(g==null)return document.createTextNode(m);t=document.createElementNS(o,g,m.is&&m),s&&(x.__m&&x.__m(e,r),s=!1),r=null}if(g==null)y===m||s&&t.data==m||(t.data=m);else{if(r=r&&nt.call(t.childNodes),!s&&r!=null)for(y={},l=0;l<t.attributes.length;l++)y[(p=t.attributes[l]).name]=p.value;for(l in y)p=y[l],l=="dangerouslySetInnerHTML"?a=p:l=="children"||l in m||l=="value"&&"defaultValue"in m||l=="checked"&&"defaultChecked"in m||Z(t,l,null,p,o);for(l in m)p=m[l],l=="children"?_=p:l=="dangerouslySetInnerHTML"?f=p:l=="value"?z=p:l=="checked"?$=p:s&&typeof p!="function"||y[l]===p||Z(t,l,p,y[l],o);if(f)s||a&&(f.__html==a.__html||f.__html==t.innerHTML)||(t.innerHTML=f.__html),e.__k=[];else if(a&&(t.innerHTML=""),Ht(e.type=="template"?t.content:t,rt(_)?_:[_],e,i,n,g=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,u,r?r[0]:i.__k&&O(i,0),s,d),r!=null)for(l=r.length;l--;)ft(r[l]);s||(l="value",g=="progress"&&z==null?t.removeAttribute("value"):z!=null&&(z!==t[l]||g=="progress"&&!z||g=="option"&&z!=y[l])&&Z(t,l,z,y[l],o),l="checked",$!=null&&$!=t[l]&&Z(t,l,$,y[l],o))}return t}function mt(t,e,i){try{if(typeof t=="function"){var n=typeof t.__u=="function";n&&t.__u(),n&&e==null||(t.__u=t(e))}else t.current=e}catch(o){x.__e(o,i)}}function Ot(t,e,i){var n,o;if(x.unmount&&x.unmount(t),(n=t.ref)&&(n.current&&n.current!=t.__e||mt(n,null,e)),(n=t.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){x.__e(r,e)}n.base=n.__P=null}if(n=t.__k)for(o=0;o<n.length;o++)n[o]&&Ot(n[o],e,i||typeof t.type!="function");i||ft(t.__e),t.__c=t.__=t.__e=void 0}function se(t,e,i){return this.constructor(t,i)}function ae(t,e,i){var n,o,r,u;e==document&&(e=document.documentElement),x.__&&x.__(t,e),o=(n=!1)?null:e.__k,r=[],u=[],ht(e,t=e.__k=ee(ot,null,[t]),o||tt,tt,e.namespaceURI,o?null:e.firstChild?nt.call(e.childNodes):null,r,o?o.__e:e.firstChild,n,u),Ft(r,t,u)}nt=et.slice,x={__e:function(t,e,i,n){for(var o,r,u;e=e.__;)if((o=e.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(t)),u=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,n||{}),u=o.__d),u)return o.__E=o}catch(s){t=s}throw t}},Et=0,Y.prototype.setState=function(t,e){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=A({},this.state),typeof t=="function"&&(t=t(A({},i),this.props)),t&&A(i,t),t!=null&&this.__v&&(e&&this._sb.push(e),xt(this))},Y.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),xt(this))},Y.prototype.render=ot,H=[],Nt=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,At=function(t,e){return t.__v.__b-e.__v.__b},it.__r=0,st=Math.random().toString(8),J="__d"+st,R="__a"+st,Ut=/(PointerCapture)$|Capture$/i,pt=0,lt=zt(!1),ct=zt(!0);var ue=0;function c(t,e,i,n,o,r){e||(e={});var u,s,d=e;if("ref"in d)for(s in d={},e)s=="ref"?u=e[s]:d[s]=e[s];var l={type:t,props:d,key:i,ref:u,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ue,__i:-1,__u:0,__source:o,__self:r};if(typeof t=="function"&&(u=t.defaultProps))for(s in u)d[s]===void 0&&(d[s]=u[s]);return x.vnode&&x.vnode(l),l}var G,q,at,qt,W=0,Bt=[],w=x,yt=w.__b,wt=w.__r,kt=w.diffed,St=w.__c,$t=w.unmount,Tt=w.__;function gt(t,e){w.__h&&w.__h(q,t,W||e),W=0;var i=q.__H||(q.__H={__:[],__h:[]});return t>=i.__.length&&i.__.push({}),i.__[t]}function T(t){return W=1,le(Gt,t)}function le(t,e,i){var n=gt(G++,2);if(n.t=t,!n.__c&&(n.__=[Gt(void 0,e),function(s){var d=n.__N?n.__N[0]:n.__[0],l=n.t(d,s);d!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=q,!q.__f)){var o=function(s,d,l){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(_){return _.__c});if(f.every(function(_){return!_.__N}))return!r||r.call(this,s,d,l);var a=n.__c.props!==s;return f.some(function(_){if(_.__N){var p=_.__[0];_.__=_.__N,_.__N=void 0,p!==_.__[0]&&(a=!0)}}),r&&r.call(this,s,d,l)||a};q.__f=!0;var r=q.shouldComponentUpdate,u=q.componentWillUpdate;q.componentWillUpdate=function(s,d,l){if(this.__e){var f=r;r=void 0,o(s,d,l),r=f}u&&u.call(this,s,d,l)},q.shouldComponentUpdate=o}return n.__N||n.__}function E(t,e){var i=gt(G++,3);!w.__s&&Rt(i.__H,e)&&(i.__=t,i.u=e,q.__H.__h.push(i))}function V(t){return W=5,Dt(function(){return{current:t}},[])}function Dt(t,e){var i=gt(G++,7);return Rt(i.__H,e)&&(i.__=t(),i.__H=e,i.__h=t),i.__}function j(t,e){return W=8,Dt(function(){return t},e)}function ce(){for(var t;t=Bt.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(X),e.__h.some(_t),e.__h=[]}catch(i){e.__h=[],w.__e(i,t.__v)}}}w.__b=function(t){q=null,yt&&yt(t)},w.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),Tt&&Tt(t,e)},w.__r=function(t){wt&&wt(t),G=0;var e=(q=t.__c).__H;e&&(at===q?(e.__h=[],q.__h=[],e.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(e.__h.some(X),e.__h.some(_t),e.__h=[],G=0)),at=q},w.diffed=function(t){kt&&kt(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Bt.push(e)!==1&&qt===w.requestAnimationFrame||((qt=w.requestAnimationFrame)||de)(ce)),e.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),at=q=null},w.__c=function(t,e){e.some(function(i){try{i.__h.some(X),i.__h=i.__h.filter(function(n){return!n.__||_t(n)})}catch(n){e.some(function(o){o.__h&&(o.__h=[])}),e=[],w.__e(n,i.__v)}}),St&&St(t,e)},w.unmount=function(t){$t&&$t(t);var e,i=t.__c;i&&i.__H&&(i.__H.__.some(function(n){try{X(n)}catch(o){e=o}}),i.__H=void 0,e&&w.__e(e,i.__v))};var It=typeof requestAnimationFrame=="function";function de(t){var e,i=function(){clearTimeout(n),It&&cancelAnimationFrame(e),setTimeout(t)},n=setTimeout(i,35);It&&(e=requestAnimationFrame(i))}function X(t){var e=q,i=t.__c;typeof i=="function"&&(t.__c=void 0,i()),q=e}function _t(t){var e=q;t.__c=t.__(),q=e}function Rt(t,e){return!t||t.length!==e.length||e.some(function(i,n){return i!==t[n]})}function Gt(t,e){return typeof e=="function"?e(t):e}function _e(t){const e=t.reduce((n,o)=>n+(o.trafficPct??0),0);if(e<=0)return t[0];let i=Math.random()*e;for(const n of t)if(i-=n.trafficPct??0,i<=0)return n;return t[t.length-1]}function pe(t,e){const i={};for(const o of Object.values(t.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const u=`quiz_${e}_vg_${o}`,s=localStorage.getItem(u);if(s&&t.nodes[s])n[o]=s;else{const d=_e(r);localStorage.setItem(u,d.id),n[o]=d.id}}return n}function fe(t,e){return Object.values(t.edges).filter(i=>i.from===e)}function he(t,e,i){return!t||t.kind==="default"?!1:t.kind==="option"?t.optionId===e&&t.questionElId===i:!1}function M(t,e,i,n,o){const r=fe(t,e);if(r.length===0)return null;if(i!==null){const s=r.find(d=>he(d.condition,i,n));if(s)return Ct(t,s.to,o)}const u=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return Ct(t,u.to,o)}function Ct(t,e,i){const n=t.nodes[e];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return t.nodes[o]??n}return n}function me(t){return Object.values(t.nodes).find(e=>e.kind==="start")??null}function ge(){const t=new URLSearchParams(location.search),e={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=t.get(n);o&&(e[n]=o)}return e}class ve{constructor(e,i){this.sessionId=e,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(e){this.buf.push({...e,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const e=this.buf.splice(0);try{await this.flushFn(this.sessionId,e)}catch{this.buf.unshift(...e)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function xe(t,e,i,n,o){const r=await fetch(`${t}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:e,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function be(t,e,i){const n={session_id:e,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${t}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function ze(t,e,i,n){const o=await fetch(`${t}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:e,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const qe={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."}};function L(t,e){const i=e??"en",n=qe[t];return i in n?n[i]:n.en}function Wt(t){if(!t)return;const e=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))e(o)};for(const i of Array.from(t.children))e(i)}function ye(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Vt(t,e){return!e||!t.includes("{")?t:t.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{const o=e[n];return o==null?i:ye(o)})}function we({el:t,variables:e}){const i=V(null),n=Vt(t.text,e);return E(()=>{i.current&&(i.current.innerHTML=n,Wt(i.current))},[n]),c("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":t.id,class:"quiz-title"})}function ke({el:t,variables:e}){const i=V(null),n=Vt(t.text,e);return E(()=>{i.current&&(i.current.innerHTML=n,Wt(i.current))},[n]),c("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":t.id,class:"quiz-text"})}function Se({el:t}){return c("img",{"data-quiz-el":"image","data-quiz-el-id":t.id,src:t.url,alt:t.alt,class:"quiz-image"})}function $e({el:t,variables:e,onVariableChange:i}){const[n,o]=T(e?.[t.variable]??"");E(()=>{i?.(t.variable,n)},[n,t.variable,i]);const r=t.inputType==="number"?"number":t.inputType==="date"?"date":"text";return c("input",{type:r,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":t.id,placeholder:t.placeholder,value:n,min:t.min,max:t.max,onInput:u=>o(u.target.value)})}function Te({el:t,variables:e,onVariableChange:i}){const[n,o]=T(Number(e?.[t.variable]??t.initial??Math.round((t.min+t.max)/2)));E(()=>{i?.(t.variable,String(n))},[n,t.variable,i]);const r=t.unit??"",u=(n-t.min)/(t.max-t.min)*100;return c("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":t.id,children:[c("div",{class:"quiz-range-value",children:[n,r&&` ${r}`]}),c("input",{type:"range",class:"quiz-range-input",min:t.min,max:t.max,step:t.step??1,value:n,style:`--quiz-range-pct: ${u}%`,onInput:s=>o(Number(s.target.value))}),c("div",{class:"quiz-range-bounds",children:[c("span",{children:[t.min,r&&` ${r}`]}),c("span",{children:[t.max,r&&` ${r}`]})]})]})}function Ie({el:t}){const[e,i]=T(0),n=t.items.length;if(n===0)return null;const o=t.items[e],r=()=>i(s=>(s+1)%n),u=()=>i(s=>(s-1+n)%n);return c("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":t.id,children:[c("div",{class:"quiz-testimonial-card",children:[o.avatar&&c("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),c("div",{class:"quiz-testimonial-body",children:[c("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&c("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),c("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),c("div",{class:"quiz-testimonial-text",children:o.text})]})]}),n>1&&c("div",{class:"quiz-testimonial-nav",children:[c("button",{type:"button",class:"quiz-testimonial-prev",onClick:u,"aria-label":"Previous",children:"←"}),c("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(s,d)=>c("button",{type:"button",class:`quiz-testimonial-dot${d===e?" quiz-testimonial-dot--active":""}`,onClick:()=>i(d),"aria-label":`Go to testimonial ${d+1}`},d))}),c("button",{type:"button",class:"quiz-testimonial-next",onClick:r,"aria-label":"Next",children:"→"})]})]})}function Ce(t){const e=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of e)for(const n of Array.from(t.querySelectorAll(i)))n.parentNode?.removeChild(n);t.innerText.trim().length===0&&(t.style.display="none")}function Pe({el:t}){const e=V(null);return E(()=>{e.current&&(e.current.innerHTML=t.html,Ce(e.current))},[t.html]),c("div",{ref:e,"data-quiz-el":"custom_html","data-quiz-el-id":t.id,class:"quiz-custom-html"})}function Ee({el:t,onComplete:e}){return E(()=>{const i=setTimeout(e,t.seconds*1e3);return()=>clearTimeout(i)},[t.seconds,e]),c("div",{"data-quiz-el":"loading","data-quiz-el-id":t.id,class:"quiz-loading",children:[c("div",{class:"quiz-loading-spinner"}),t.text&&c("p",{class:"quiz-loading-text",children:t.text})]})}function Ne({option:t,layout:e,selected:i,onClick:n}){const o=["quiz-option",`quiz-option--${e}`,i?"quiz-option--selected":""].filter(Boolean).join(" ");return c("button",{class:o,"data-quiz-opt-id":t.id,onClick:n,type:"button",children:[e==="image_cards"&&t.imageUrl&&c("img",{src:t.imageUrl,alt:t.label,class:"quiz-option-img"}),t.emoji&&c("span",{class:"quiz-option-emoji",children:t.emoji}),c("span",{class:"quiz-option-label",children:t.label})]})}function Ae({el:t,onAnswer:e,market:i}){const[n,o]=T(new Set),r=u=>{t.kindOf==="single"?(o(new Set([u])),setTimeout(()=>e(t.id,u),200)):o(s=>{const d=new Set(s);return d.has(u)?d.delete(u):d.add(u),d})};return c("div",{"data-quiz-el":"question","data-quiz-el-id":t.id,class:`quiz-question quiz-question--${t.layout}`,children:[t.options.map(u=>c(Ne,{option:u,layout:t.layout,selected:n.has(u.id),onClick:()=>r(u.id)},u.id)),t.kindOf==="multi"&&n.size>0&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const u=[...n][0];e(t.id,u)},children:L("continue",i)})]})}function Ue({onSubmit:t,market:e}){const[i,n]=T(""),[o,r]=T("");return c("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!i.includes("@")){r(L("invalidEmail",e));return}r(""),t(i)},novalidate:!0,children:[c("input",{type:"email",class:"quiz-email-input",placeholder:L("emailPlaceholder",e),value:i,onInput:s=>n(s.target.value),required:!0}),o&&c("p",{class:"quiz-email-error",children:o}),c("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:L("continue",e)})]})}function je({node:t,onAnswer:e,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:u,variables:s,onVariableChange:d}){const l=t.subEls.some(_=>_.kind==="question"),f=t.subEls.some(_=>_.kind==="loading"),a=!l&&!f&&typeof u=="function";return c("div",{class:"quiz-step","data-step-id":t.id,children:[t.subEls.map(_=>{switch(_.kind){case"title":return c(we,{el:_,variables:s},_.id);case"text":return c(ke,{el:_,variables:s},_.id);case"image":return c(Se,{el:_},_.id);case"custom_html":return c(Pe,{el:_},_.id);case"loading":return c(Ee,{el:_,onComplete:i},_.id);case"question":return c(Ae,{el:_,onAnswer:e,market:r},_.id);case"text_input":return c($e,{el:_,variables:s,onVariableChange:d},_.id);case"range_slider":return c(Te,{el:_,variables:s,onVariableChange:d},_.id);case"testimonial_slider":return c(Ie,{el:_},_.id)}}),o===t.id&&c(Ue,{onSubmit:n,market:r}),a&&c("div",{class:"quiz-continue-wrap",children:c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:u,children:L("continue",r)})})]})}function He({current:t,total:e}){const i=e>0?Math.round(t/e*100):0;return c("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:c("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Le(t){const{brandColors:e,fontSettings:i}=t,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
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
  `,document.head.appendChild(o)}function Fe(t){const e=Object.values(t.nodes).filter(s=>s.kind==="step"),i=new Set(e.map(s=>s.id)),n=Object.values(t.nodes).find(s=>s.kind==="start"),o=[];if(n)for(const s of Object.values(t.edges))s.from===n.id&&i.has(s.to)&&o.push(s.to);else for(const s of e)o.push(s.id);const r=new Set,u=[];for(;o.length;){const s=o.shift();if(r.has(s))continue;r.add(s);const d=t.nodes[s];d&&d.kind==="step"&&u.push(d);for(const l of Object.values(t.edges))l.from===s&&i.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const s of e)r.has(s.id)||u.push(s);return u}function ut(t,e){typeof window.fbq=="function"&&window.fbq("track",t,e)}function Me({data:t,settings:e,config:i}){const[n,o]=T(null),[r,u]=T([]),[s,d]=T(null),[l,f]=T({}),[a,_]=T(0),[p,z]=T(null),[$,y]=T({}),m=V(null),g=V(!1);E(()=>{if(!p)return;const h=setTimeout(()=>z(null),4e3);return()=>clearTimeout(h)},[p]);const S=Fe(t),P=S.length;E(()=>{if(g.current)return;g.current=!0;const h=pe(t,i.quizId);f(h);const v=me(t);if(!v){console.error("[quiz-runtime] No start node found");return}const b=M(t,v.id,null,null,h);if(o(b),!i.preview&&e.providers.metaPixel?.pixelId&&ut("PageView",{}),i.preview)return;const N=ge();xe(i.apiBaseUrl,i.quizId,h,N,t.id??"").then(C=>{d(C),m.current=new ve(C,(D,Xt)=>be(i.apiBaseUrl,D,Xt)),b&&b.kind==="step"&&m.current.push({event_type:"step_view",step_id:b.id,variant_group_id:b.variantGroupId})}).catch(C=>{console.warn("[quiz-runtime] session start failed:",C)})},[]),E(()=>()=>m.current?.destroy(),[]),E(()=>{if(!n||n.kind!=="step")return;const h=n;if(h.subEls.length===0){const v=M(t,h.id,null,null,l);v&&v.id!==n.id&&k(v,!1)}},[n]);const k=j((h,v=!0)=>{if(v&&n&&u(b=>[...b,n]),o(h),h.kind==="step"){const b=S.findIndex(N=>N.id===h.id);b>=0&&_(b),i.preview||m.current?.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId})}},[n,S,i.preview]),Q=j((h,v)=>{if(!n||n.kind!=="step")return;const b=n.subEls.find(C=>C.id===h&&C.kind==="question");if(b&&b.kind==="question"&&b.variable){const C=b.options.find(D=>D.id===v);C&&y(D=>({...D,[b.variable]:C.label}))}i.preview||m.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:v,meta:{questionElId:h}});const N=M(t,n.id,v,h,l);N&&k(N)},[n,t,l,k]),F=j((h,v)=>{y(b=>({...b,[h]:v}))},[]),B=j(()=>{if(!n||n.kind!=="step")return;const h=M(t,n.id,null,null,l);h&&k(h)},[n,t,l,k]),I=j(()=>{if(!n||n.kind!=="step")return;const h=M(t,n.id,null,null,l);h&&k(h)},[n,t,l,k]),U=j(async h=>{if(!i.preview&&(m.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:h}}),e.providers.metaPixel?.pixelId&&ut("Lead",{content_name:e.metadata.title,value:0}),e.providers.klaviyo?.listId&&s))try{await ze(i.apiBaseUrl,s,h,e.providers.klaviyo.listId)}catch(v){console.warn("[quiz-runtime] Klaviyo subscribe failed:",v)}if(n&&n.kind==="step"){const v=M(t,n.id,null,null,l);v&&k(v)}},[n,t,l,k,s,e,i]),Qt=j(()=>{i.preview||m.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),u(h=>{if(h.length===0)return h;const v=h[h.length-1],b=h.slice(0,-1);if(o(v),v.kind==="step"){const N=S.findIndex(C=>C.id===v.id);N>=0&&_(N)}return b})},[n,S]),Zt=j(h=>{if(i.preview){const v=h.redirectUrl||e.redirectUrl||"(no redirect URL)";z(`[Preview] Would redirect to: ${v}`);return}m.current?.push({event_type:"exit_click"}),e.providers.metaPixel?.pixelId&&ut("CompleteRegistration",{content_name:e.metadata.title,value:0}),m.current?.flush().finally(()=>{const v=h.redirectUrl||e.redirectUrl||"",b=new URL(v,location.href);b.searchParams.set("utm_source","quiz"),b.searchParams.set("utm_campaign",document.title||"quiz"),s&&b.searchParams.set("utm_content",s),location.href=b.toString()})},[e,s,i.preview]);if(n?.kind==="exit"){const h=n;return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-content quiz-exit",children:[c("p",{class:"quiz-text",children:L("loadingResults",i.market)}),c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>Zt(h),children:L("seeResults",i.market)})]}),p&&c("div",{class:"quiz-preview-toast",children:p})]})}if(!n||n.kind!=="step")return c("div",{class:"quiz-shell",children:c("div",{class:"quiz-content",children:c("div",{class:"quiz-loading",children:c("div",{class:"quiz-loading-spinner"})})})});const Jt=n,Kt=e.backNavigation&&r.length>0,Yt=e.providers.klaviyo?.captureAtStepId;return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-header",children:[Kt&&c("button",{class:"quiz-back-btn",type:"button",onClick:Qt,"aria-label":"Go back",children:"←"}),e.brandLogo?.enabled&&e.brandLogo.url&&c("img",{src:e.brandLogo.url,alt:"Logo",class:"quiz-logo"}),e.stepProgressCount&&c("span",{class:"quiz-step-count",children:[a+1," / ",P]})]}),e.progressBar&&c(He,{current:a+1,total:P}),c("div",{class:"quiz-content",children:c(je,{node:Jt,onAnswer:Q,onLoadingComplete:B,onEmailSubmit:U,captureAtStepId:Yt,market:i.market,onContinue:I,variables:$,onVariableChange:F})})]})}function Pt(){const t=window.__QUIZ_DATA__,e=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!t||!e||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Le(e);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}ae(c(Me,{data:t,settings:e,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Pt):Pt();
