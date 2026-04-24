var ne,x,Le,H,be,je,Ae,se,J,G,Ue,_e,le,ce,ee={},te=[],et=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,re=Array.isArray;function j(e,t){for(var i in t)e[i]=t[i];return e}function fe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function tt(e,t,i){var n,o,r,u={};for(r in t)r=="key"?n=t[r]:r=="ref"?o=t[r]:u[r]=t[r];if(arguments.length>2&&(u.children=arguments.length>3?ne.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(r in e.defaultProps)u[r]===void 0&&(u[r]=e.defaultProps[r]);return K(e,u,n,o,null)}function K(e,t,i,n,o){var r={type:e,props:t,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Le,__i:-1,__u:0};return o==null&&x.vnode!=null&&x.vnode(r),r}function oe(e){return e.children}function Y(e,t){this.props=e,this.context=t}function R(e,t){if(t==null)return e.__?R(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?R(e):null}function it(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,n=[],o=[],r=j({},t);r.__v=t.__v+1,x.vnode&&x.vnode(r),he(e.__P,r,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,n,i??R(t),!!(32&t.__u),o),r.__v=t.__v,r.__.__k[r.__i]=r,Oe(n,r,o),t.__e=t.__=null,r.__e!=i&&He(r)}}function He(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),He(e)}function ze(e){(!e.__d&&(e.__d=!0)&&H.push(e)&&!ie.__r++||be!=x.debounceRendering)&&((be=x.debounceRendering)||je)(ie)}function ie(){try{for(var e,t=1;H.length;)H.length>t&&H.sort(Ae),e=H.shift(),t=H.length,it(e)}finally{H.length=ie.__r=0}}function Fe(e,t,i,n,o,r,u,s,d,l,f){var a,p,_,z,I,y,m,g=n&&n.__k||te,$=t.length;for(d=nt(i,t,g,d,$),a=0;a<$;a++)(_=i.__k[a])!=null&&(p=_.__i!=-1&&g[_.__i]||ee,_.__i=a,y=he(e,_,p,o,r,u,s,d,l,f),z=_.__e,_.ref&&p.ref!=_.ref&&(p.ref&&me(p.ref,null,_),f.push(_.ref,_.__c||z,_)),I==null&&z!=null&&(I=z),(m=!!(4&_.__u))||p.__k===_.__k?(d=Me(_,d,e,m),m&&p.__e&&(p.__e=null)):typeof _.type=="function"&&y!==void 0?d=y:z&&(d=z.nextSibling),_.__u&=-7);return i.__e=I,d}function nt(e,t,i,n,o){var r,u,s,d,l,f=i.length,a=f,p=0;for(e.__k=new Array(o),r=0;r<o;r++)(u=t[r])!=null&&typeof u!="boolean"&&typeof u!="function"?(typeof u=="string"||typeof u=="number"||typeof u=="bigint"||u.constructor==String?u=e.__k[r]=K(null,u,null,null,null):re(u)?u=e.__k[r]=K(oe,{children:u},null,null,null):u.constructor===void 0&&u.__b>0?u=e.__k[r]=K(u.type,u.props,u.key,u.ref?u.ref:null,u.__v):e.__k[r]=u,d=r+p,u.__=e,u.__b=e.__b+1,s=null,(l=u.__i=rt(u,i,d,a))!=-1&&(a--,(s=i[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(o>f?p--:o<f&&p++),typeof u.type!="function"&&(u.__u|=4)):l!=d&&(l==d-1?p--:l==d+1?p++:(l>d?p--:p++,u.__u|=4))):e.__k[r]=null;if(a)for(r=0;r<f;r++)(s=i[r])!=null&&(2&s.__u)==0&&(s.__e==n&&(n=R(s)),De(s,s));return n}function Me(e,t,i,n){var o,r;if(typeof e.type=="function"){for(o=e.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=e,t=Me(o[r],t,i,n));return t}e.__e!=t&&(n&&(t&&e.type&&!t.parentNode&&(t=R(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function rt(e,t,i,n){var o,r,u,s=e.key,d=e.type,l=t[i],f=l!=null&&(2&l.__u)==0;if(l===null&&s==null||f&&s==l.key&&d==l.type)return i;if(n>(f?1:0)){for(o=i-1,r=i+1;o>=0||r<t.length;)if((l=t[u=o>=0?o--:r++])!=null&&(2&l.__u)==0&&s==l.key&&d==l.type)return u}return-1}function qe(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||et.test(t)?i:i+"px"}function Z(e,t,i,n,o){var r,u;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof n=="string"&&(e.style.cssText=n=""),n)for(t in n)i&&t in i||qe(e.style,t,"");if(i)for(t in i)n&&i[t]==n[t]||qe(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")r=t!=(t=t.replace(Ue,"$1")),u=t.toLowerCase(),t=u in e||t=="onFocusOut"||t=="onFocusIn"?u.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+r]=i,i?n?i[G]=n[G]:(i[G]=_e,e.addEventListener(t,r?ce:le,r)):e.removeEventListener(t,r?ce:le,r);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function ye(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[J]==null)t[J]=_e++;else if(t[J]<i[G])return;return i(x.event?x.event(t):t)}}}function he(e,t,i,n,o,r,u,s,d,l){var f,a,p,_,z,I,y,m,g,$,E,S,W,M,D,C=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(d=!!(32&i.__u),r=[s=t.__e=i.__e]),(f=x.__b)&&f(t);e:if(typeof C=="function")try{if(m=t.props,g=C.prototype&&C.prototype.render,$=(f=C.contextType)&&n[f.__c],E=f?$?$.props.value:f.__:n,i.__c?y=(a=t.__c=i.__c).__=a.__E:(g?t.__c=a=new C(m,E):(t.__c=a=new Y(m,E),a.constructor=C,a.render=st),$&&$.sub(a),a.state||(a.state={}),a.__n=n,p=a.__d=!0,a.__h=[],a._sb=[]),g&&a.__s==null&&(a.__s=a.state),g&&C.getDerivedStateFromProps!=null&&(a.__s==a.state&&(a.__s=j({},a.__s)),j(a.__s,C.getDerivedStateFromProps(m,a.__s))),_=a.props,z=a.state,a.__v=t,p)g&&C.getDerivedStateFromProps==null&&a.componentWillMount!=null&&a.componentWillMount(),g&&a.componentDidMount!=null&&a.__h.push(a.componentDidMount);else{if(g&&C.getDerivedStateFromProps==null&&m!==_&&a.componentWillReceiveProps!=null&&a.componentWillReceiveProps(m,E),t.__v==i.__v||!a.__e&&a.shouldComponentUpdate!=null&&a.shouldComponentUpdate(m,a.__s,E)===!1){t.__v!=i.__v&&(a.props=m,a.state=a.__s,a.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(A){A&&(A.__=t)}),te.push.apply(a.__h,a._sb),a._sb=[],a.__h.length&&u.push(a);break e}a.componentWillUpdate!=null&&a.componentWillUpdate(m,a.__s,E),g&&a.componentDidUpdate!=null&&a.__h.push(function(){a.componentDidUpdate(_,z,I)})}if(a.context=E,a.props=m,a.__P=e,a.__e=!1,S=x.__r,W=0,g)a.state=a.__s,a.__d=!1,S&&S(t),f=a.render(a.props,a.state,a.context),te.push.apply(a.__h,a._sb),a._sb=[];else do a.__d=!1,S&&S(t),f=a.render(a.props,a.state,a.context),a.state=a.__s;while(a.__d&&++W<25);a.state=a.__s,a.getChildContext!=null&&(n=j(j({},n),a.getChildContext())),g&&!p&&a.getSnapshotBeforeUpdate!=null&&(I=a.getSnapshotBeforeUpdate(_,z)),M=f!=null&&f.type===oe&&f.key==null?Re(f.props.children):f,s=Fe(e,re(M)?M:[M],t,i,n,o,r,u,s,d,l),a.base=t.__e,t.__u&=-161,a.__h.length&&u.push(a),y&&(a.__E=a.__=null)}catch(A){if(t.__v=null,d||r!=null)if(A.then){for(t.__u|=d?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,t.__e=s}else{for(D=r.length;D--;)fe(r[D]);de(t)}else t.__e=i.__e,t.__k=i.__k,A.then||de(t);x.__e(A,t,i)}else r==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):s=t.__e=ot(i.__e,t,i,n,o,r,u,d,l);return(f=x.diffed)&&f(t),128&t.__u?void 0:s}function de(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(de))}function Oe(e,t,i){for(var n=0;n<i.length;n++)me(i[n],i[++n],i[++n]);x.__c&&x.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(r){r.call(o)})}catch(r){x.__e(r,o.__v)}})}function Re(e){return typeof e!="object"||e==null||e.__b>0?e:re(e)?e.map(Re):j({},e)}function ot(e,t,i,n,o,r,u,s,d){var l,f,a,p,_,z,I,y=i.props||ee,m=t.props,g=t.type;if(g=="svg"?o="http://www.w3.org/2000/svg":g=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((_=r[l])&&"setAttribute"in _==!!g&&(g?_.localName==g:_.nodeType==3)){e=_,r[l]=null;break}}if(e==null){if(g==null)return document.createTextNode(m);e=document.createElementNS(o,g,m.is&&m),s&&(x.__m&&x.__m(t,r),s=!1),r=null}if(g==null)y===m||s&&e.data==m||(e.data=m);else{if(r=r&&ne.call(e.childNodes),!s&&r!=null)for(y={},l=0;l<e.attributes.length;l++)y[(_=e.attributes[l]).name]=_.value;for(l in y)_=y[l],l=="dangerouslySetInnerHTML"?a=_:l=="children"||l in m||l=="value"&&"defaultValue"in m||l=="checked"&&"defaultChecked"in m||Z(e,l,null,_,o);for(l in m)_=m[l],l=="children"?p=_:l=="dangerouslySetInnerHTML"?f=_:l=="value"?z=_:l=="checked"?I=_:s&&typeof _!="function"||y[l]===_||Z(e,l,_,y[l],o);if(f)s||a&&(f.__html==a.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(a&&(e.innerHTML=""),Fe(t.type=="template"?e.content:e,re(p)?p:[p],t,i,n,g=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,u,r?r[0]:i.__k&&R(i,0),s,d),r!=null)for(l=r.length;l--;)fe(r[l]);s||(l="value",g=="progress"&&z==null?e.removeAttribute("value"):z!=null&&(z!==e[l]||g=="progress"&&!z||g=="option"&&z!=y[l])&&Z(e,l,z,y[l],o),l="checked",I!=null&&I!=e[l]&&Z(e,l,I,y[l],o))}return e}function me(e,t,i){try{if(typeof e=="function"){var n=typeof e.__u=="function";n&&e.__u(),n&&t==null||(e.__u=e(t))}else e.current=t}catch(o){x.__e(o,i)}}function De(e,t,i){var n,o;if(x.unmount&&x.unmount(e),(n=e.ref)&&(n.current&&n.current!=e.__e||me(n,null,t)),(n=e.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(r){x.__e(r,t)}n.base=n.__P=null}if(n=e.__k)for(o=0;o<n.length;o++)n[o]&&De(n[o],t,i||typeof e.type!="function");i||fe(e.__e),e.__c=e.__=e.__e=void 0}function st(e,t,i){return this.constructor(e,i)}function at(e,t,i){var n,o,r,u;t==document&&(t=document.documentElement),x.__&&x.__(e,t),o=(n=!1)?null:t.__k,r=[],u=[],he(t,e=t.__k=tt(oe,null,[e]),o||ee,ee,t.namespaceURI,o?null:t.firstChild?ne.call(t.childNodes):null,r,o?o.__e:t.firstChild,n,u),Oe(r,e,u)}ne=te.slice,x={__e:function(e,t,i,n){for(var o,r,u;t=t.__;)if((o=t.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(e)),u=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,n||{}),u=o.__d),u)return o.__E=o}catch(s){e=s}throw e}},Le=0,Y.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=j({},this.state),typeof e=="function"&&(e=e(j({},i),this.props)),e&&j(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),ze(this))},Y.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),ze(this))},Y.prototype.render=oe,H=[],je=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ae=function(e,t){return e.__v.__b-t.__v.__b},ie.__r=0,se=Math.random().toString(8),J="__d"+se,G="__a"+se,Ue=/(PointerCapture)$|Capture$/i,_e=0,le=ye(!1),ce=ye(!0);var ut=0;function c(e,t,i,n,o,r){t||(t={});var u,s,d=t;if("ref"in d)for(s in d={},t)s=="ref"?u=t[s]:d[s]=t[s];var l={type:e,props:d,key:i,ref:u,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ut,__i:-1,__u:0,__source:o,__self:r};if(typeof e=="function"&&(u=e.defaultProps))for(s in u)d[s]===void 0&&(d[s]=u[s]);return x.vnode&&x.vnode(l),l}var V,q,ae,we,Q=0,Be=[],w=x,ke=w.__b,Se=w.__r,$e=w.diffed,Ie=w.__c,Ce=w.unmount,Te=w.__;function ge(e,t){w.__h&&w.__h(q,e,Q||t),Q=0;var i=q.__H||(q.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function k(e){return Q=1,lt(Qe,e)}function lt(e,t,i){var n=ge(V++,2);if(n.t=e,!n.__c&&(n.__=[Qe(void 0,t),function(s){var d=n.__N?n.__N[0]:n.__[0],l=n.t(d,s);d!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=q,!q.__f)){var o=function(s,d,l){if(!n.__c.__H)return!0;var f=n.__c.__H.__.filter(function(p){return p.__c});if(f.every(function(p){return!p.__N}))return!r||r.call(this,s,d,l);var a=n.__c.props!==s;return f.some(function(p){if(p.__N){var _=p.__[0];p.__=p.__N,p.__N=void 0,_!==p.__[0]&&(a=!0)}}),r&&r.call(this,s,d,l)||a};q.__f=!0;var r=q.shouldComponentUpdate,u=q.componentWillUpdate;q.componentWillUpdate=function(s,d,l){if(this.__e){var f=r;r=void 0,o(s,d,l),r=f}u&&u.call(this,s,d,l)},q.shouldComponentUpdate=o}return n.__N||n.__}function P(e,t){var i=ge(V++,3);!w.__s&&Ve(i.__H,t)&&(i.__=e,i.u=t,q.__H.__h.push(i))}function F(e){return Q=5,Ge(function(){return{current:e}},[])}function Ge(e,t){var i=ge(V++,7);return Ve(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function U(e,t){return Q=8,Ge(function(){return e},t)}function ct(){for(var e;e=Be.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(X),t.__h.some(pe),t.__h=[]}catch(i){t.__h=[],w.__e(i,e.__v)}}}w.__b=function(e){q=null,ke&&ke(e)},w.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Te&&Te(e,t)},w.__r=function(e){Se&&Se(e),V=0;var t=(q=e.__c).__H;t&&(ae===q?(t.__h=[],q.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(X),t.__h.some(pe),t.__h=[],V=0)),ae=q},w.diffed=function(e){$e&&$e(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(Be.push(t)!==1&&we===w.requestAnimationFrame||((we=w.requestAnimationFrame)||dt)(ct)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),ae=q=null},w.__c=function(e,t){t.some(function(i){try{i.__h.some(X),i.__h=i.__h.filter(function(n){return!n.__||pe(n)})}catch(n){t.some(function(o){o.__h&&(o.__h=[])}),t=[],w.__e(n,i.__v)}}),Ie&&Ie(e,t)},w.unmount=function(e){Ce&&Ce(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(n){try{X(n)}catch(o){t=o}}),i.__H=void 0,t&&w.__e(t,i.__v))};var Pe=typeof requestAnimationFrame=="function";function dt(e){var t,i=function(){clearTimeout(n),Pe&&cancelAnimationFrame(t),setTimeout(e)},n=setTimeout(i,35);Pe&&(t=requestAnimationFrame(i))}function X(e){var t=q,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),q=t}function pe(e){var t=q;e.__c=e.__(),q=t}function Ve(e,t){return!e||e.length!==t.length||t.some(function(i,n){return i!==e[n]})}function Qe(e,t){return typeof t=="function"?t(e):t}function pt(e){const t=e.reduce((n,o)=>n+(o.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const n of e)if(i-=n.trafficPct??0,i<=0)return n;return e[e.length-1]}function _t(e,t){const i={};for(const o of Object.values(e.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;i[r]||(i[r]=[]),i[r].push(o)}const n={};for(const[o,r]of Object.entries(i)){const u=`quiz_${t}_vg_${o}`,s=localStorage.getItem(u);if(s&&e.nodes[s])n[o]=s;else{const d=pt(r);localStorage.setItem(u,d.id),n[o]=d.id}}return n}function ft(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function ht(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function O(e,t,i,n,o){const r=ft(e,t);if(r.length===0)return null;if(i!==null){const s=r.find(d=>ht(d.condition,i,n));if(s)return Ee(e,s.to,o)}const u=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return Ee(e,u.to,o)}function Ee(e,t,i){const n=e.nodes[t];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const o=i[n.variantGroupId];if(o)return e.nodes[o]??n}return n}function mt(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function gt(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const o=e.get(n);o&&(t[n]=o)}return t}class vt{constructor(t,i){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function xt(e,t,i,n,o){const r=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:n,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function bt(e,t,i){const n={session_id:t,events:i.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function zt(e,t,i,n){const o=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:n})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const qt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function N(e,t){const i=t??"en",n=qt[e];return i in n?n[i]:n.en}function We(e){if(!e)return;const t=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const o=n.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?i.setAttribute("style",o):i.removeAttribute("style")}for(const o of Array.from(i.children))t(o)};for(const i of Array.from(e.children))t(i)}function yt(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function ve(e,t){return!t||!e.includes("{")?e:e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{const o=t[n];return o==null?i:yt(o)})}function wt({el:e,variables:t}){const i=F(null),n=ve(e.text,t);return P(()=>{i.current&&(i.current.innerHTML=n,We(i.current))},[n]),c("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function kt({el:e,variables:t}){const i=F(null),n=ve(e.text,t);return P(()=>{i.current&&(i.current.innerHTML=n,We(i.current))},[n]),c("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function St({el:e}){return c("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function $t({el:e,variables:t,onVariableChange:i}){const[n,o]=k(t?.[e.variable]??"");P(()=>{i?.(e.variable,n)},[n,e.variable,i]);const r=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return c("input",{type:r,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:n,min:e.min,max:e.max,onInput:u=>o(u.target.value)})}function It({el:e,variables:t,onVariableChange:i}){const[n,o]=k(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));P(()=>{i?.(e.variable,String(n))},[n,e.variable,i]);const r=e.unit??"",u=(n-e.min)/(e.max-e.min)*100;return c("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-range-value",children:[n,r&&` ${r}`]}),c("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:n,style:`--quiz-range-pct: ${u}%`,onInput:s=>o(Number(s.target.value))}),c("div",{class:"quiz-range-bounds",children:[c("span",{children:[e.min,r&&` ${r}`]}),c("span",{children:[e.max,r&&` ${r}`]})]})]})}function Ct({el:e}){const[t,i]=k(0),n=e.items.length;if(n===0)return null;const o=e.items[t],r=()=>i(s=>(s+1)%n),u=()=>i(s=>(s-1+n)%n);return c("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[c("div",{class:"quiz-testimonial-card",children:[o.avatar&&c("img",{src:o.avatar,alt:o.name,class:"quiz-testimonial-avatar"}),c("div",{class:"quiz-testimonial-body",children:[c("div",{class:"quiz-testimonial-name",children:o.name}),typeof o.rating=="number"&&c("div",{class:"quiz-testimonial-rating","aria-label":`${o.rating} stars`,children:["★".repeat(Math.round(o.rating)),c("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(o.rating)))})]}),c("div",{class:"quiz-testimonial-text",children:o.text})]})]}),n>1&&c("div",{class:"quiz-testimonial-nav",children:[c("button",{type:"button",class:"quiz-testimonial-prev",onClick:u,"aria-label":"Previous",children:"←"}),c("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(s,d)=>c("button",{type:"button",class:`quiz-testimonial-dot${d===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(d),"aria-label":`Go to testimonial ${d+1}`},d))}),c("button",{type:"button",class:"quiz-testimonial-next",onClick:r,"aria-label":"Next",children:"→"})]})]})}function Tt(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function Pt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const n of Array.from(e.querySelectorAll(i)))n.parentNode?.removeChild(n);e.innerText.trim().length===0&&(e.style.display="none")}function Et({el:e,variables:t}){const i=F(null),n=F(null),o=ve(e.html,t),r=Tt(o);return P(()=>{r||!i.current||(i.current.innerHTML=o,Pt(i.current))},[o,r]),P(()=>{if(!r||!n.current)return;const u=n.current;let s=null,d=0;const l=()=>{try{const a=u.contentDocument;if(!a)return;const p=a.documentElement?.scrollHeight??0;p>0&&(u.style.height=p+"px")}catch{}},f=()=>{l(),d=requestAnimationFrame(l);try{const a=u.contentDocument;a&&typeof ResizeObserver<"u"&&(s=new ResizeObserver(l),s.observe(a.documentElement))}catch{}};return u.addEventListener("load",f),f(),()=>{u.removeEventListener("load",f),s?.disconnect(),d&&cancelAnimationFrame(d)}},[o,r]),r?c("iframe",{ref:n,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:o,title:`Custom block ${e.id}`}):c("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function Nt({el:e,onComplete:t}){return P(()=>{const i=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(i)},[e.seconds,t]),c("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[c("div",{class:"quiz-loading-spinner"}),e.text&&c("p",{class:"quiz-loading-text",children:e.text})]})}function Lt({option:e,layout:t,selected:i,onClick:n}){const o=["quiz-option",`quiz-option--${t}`,i?"quiz-option--selected":""].filter(Boolean).join(" ");return c("button",{class:o,"data-quiz-opt-id":e.id,onClick:n,type:"button",children:[t==="image_cards"&&e.imageUrl&&c("img",{src:e.imageUrl,alt:e.label,class:"quiz-option-img"}),e.emoji&&c("span",{class:"quiz-option-emoji",children:e.emoji}),c("span",{class:"quiz-option-label",children:e.label})]})}function jt({el:e,onAnswer:t,market:i}){const[n,o]=k(new Set),r=u=>{e.kindOf==="single"?(o(new Set([u])),setTimeout(()=>t(e.id,u),200)):o(s=>{const d=new Set(s);return d.has(u)?d.delete(u):d.add(u),d})};return e.layout==="dropdown"?c(At,{el:e,onPick:u=>r(u),market:i}):c("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[e.options.map(u=>c(Lt,{option:u,layout:e.layout,selected:n.has(u.id),onClick:()=>r(u.id)},u.id)),e.kindOf==="multi"&&n.size>0&&c("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const u=[...n][0];t(e.id,u)},children:N("continue",i)})]})}function At({el:e,onPick:t,market:i}){const[n,o]=k(!1),[r,u]=k(""),[s,d]=k(null),l=F(null);P(()=>{if(!n)return;const _=z=>{l.current&&!l.current.contains(z.target)&&o(!1)};return document.addEventListener("mousedown",_),()=>document.removeEventListener("mousedown",_)},[n]);const f=r.trim().toLowerCase(),a=f?e.options.filter(_=>_.label.toLowerCase().includes(f)):e.options,p=e.dropdownPlaceholder||(e.searchable?N("searchPlaceholder",i):N("selectPlaceholder",i));return c("div",{class:`quiz-dropdown${n?" quiz-dropdown--open":""}`,"data-quiz-el":"question","data-quiz-el-id":e.id,ref:l,children:[c("button",{type:"button",class:"quiz-dropdown-trigger",onClick:()=>o(_=>!_),"aria-expanded":n,children:[c("span",{class:s?"":"quiz-dropdown-placeholder",children:s??p}),c("span",{class:"quiz-dropdown-chevron","aria-hidden":"true",children:"▾"})]}),n&&c("div",{class:"quiz-dropdown-panel",children:[e.searchable&&c("input",{type:"text",class:"quiz-dropdown-search",placeholder:p,value:r,autoFocus:!0,onInput:_=>u(_.target.value)}),c("ul",{class:"quiz-dropdown-list",children:[a.length===0&&c("li",{class:"quiz-dropdown-empty",children:N("noMatches",i)}),a.map(_=>c("li",{children:c("button",{type:"button",class:"quiz-dropdown-item","data-quiz-opt-id":_.id,onClick:()=>{d(_.label),o(!1),u(""),t(_.id)},children:[_.emoji&&c("span",{class:"quiz-dropdown-emoji",children:_.emoji}),_.label]})},_.id))]})]})]})}function Ut({onSubmit:e,market:t}){const[i,n]=k(""),[o,r]=k("");return c("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!i.includes("@")){r(N("invalidEmail",t));return}r(""),e(i)},novalidate:!0,children:[c("input",{type:"email",class:"quiz-email-input",placeholder:N("emailPlaceholder",t),value:i,onInput:s=>n(s.target.value),required:!0}),o&&c("p",{class:"quiz-email-error",children:o}),c("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:N("continue",t)})]})}function Ht({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:o,market:r,onContinue:u,variables:s,onVariableChange:d}){const l=e.subEls.some(p=>p.kind==="question"),f=e.subEls.some(p=>p.kind==="loading"),a=!l&&!f&&typeof u=="function";return c("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(p=>{switch(p.kind){case"title":return c(wt,{el:p,variables:s},p.id);case"text":return c(kt,{el:p,variables:s},p.id);case"image":return c(St,{el:p},p.id);case"custom_html":return c(Et,{el:p,variables:s},p.id);case"loading":return c(Nt,{el:p,onComplete:i},p.id);case"question":return c(jt,{el:p,onAnswer:t,market:r},p.id);case"text_input":return c($t,{el:p,variables:s,onVariableChange:d},p.id);case"range_slider":return c(It,{el:p,variables:s,onVariableChange:d},p.id);case"testimonial_slider":return c(Ct,{el:p},p.id)}}),o===e.id&&c(Ut,{onSubmit:n,market:r}),a&&c("div",{class:"quiz-continue-wrap",children:c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:u,children:N("continue",r)})})]})}function Ft({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return c("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:c("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Mt(e){const{brandColors:t,fontSettings:i}=e,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${t.background};
  --quiz-text-primary: ${t.textPrimary};
  --quiz-text-secondary: ${t.textSecondary};
  --quiz-brand: ${t.primaryBrand};
  --quiz-option-bg: ${t.optionBackground};
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

.quiz-step {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: quiz-step-in 0.28s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes quiz-step-in {
  from { opacity: 0; transform: translate3d(16px, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
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
  `,document.head.appendChild(o)}function Ot(e){const t=Object.values(e.nodes).filter(s=>s.kind==="step"),i=new Set(t.map(s=>s.id)),n=Object.values(e.nodes).find(s=>s.kind==="start"),o=[];if(n)for(const s of Object.values(e.edges))s.from===n.id&&i.has(s.to)&&o.push(s.to);else for(const s of t)o.push(s.id);const r=new Set,u=[];for(;o.length;){const s=o.shift();if(r.has(s))continue;r.add(s);const d=e.nodes[s];d&&d.kind==="step"&&u.push(d);for(const l of Object.values(e.edges))l.from===s&&i.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const s of t)r.has(s.id)||u.push(s);return u}function ue(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function Rt({data:e,settings:t,config:i}){const[n,o]=k(null),[r,u]=k([]),[s,d]=k(null),[l,f]=k({}),[a,p]=k(0),[_,z]=k(null),[I,y]=k({}),m=F(null),g=F(!1);P(()=>{if(!_)return;const h=setTimeout(()=>z(null),4e3);return()=>clearTimeout(h)},[_]);const $=Ot(e),E=$.length;P(()=>{if(g.current)return;g.current=!0;const h=_t(e,i.quizId);f(h);const v=mt(e);if(!v){console.error("[quiz-runtime] No start node found");return}const b=O(e,v.id,null,null,h);if(o(b),!i.preview&&t.providers.metaPixel?.pixelId&&ue("PageView",{}),i.preview)return;const L=gt();xt(i.apiBaseUrl,i.quizId,h,L,e.id??"").then(T=>{d(T),m.current=new vt(T,(B,Xe)=>bt(i.apiBaseUrl,B,Xe)),b&&b.kind==="step"&&m.current.push({event_type:"step_view",step_id:b.id,variant_group_id:b.variantGroupId})}).catch(T=>{console.warn("[quiz-runtime] session start failed:",T)})},[]),P(()=>()=>m.current?.destroy(),[]),P(()=>{if(!n||n.kind!=="step")return;const h=n;if(h.subEls.length===0){const v=O(e,h.id,null,null,l);v&&v.id!==n.id&&S(v,!1)}},[n]);const S=U((h,v=!0)=>{if(v&&n&&u(b=>[...b,n]),o(h),h.kind==="step"){const b=$.findIndex(L=>L.id===h.id);b>=0&&p(b),i.preview||m.current?.push({event_type:"step_view",step_id:h.id,variant_group_id:h.variantGroupId})}},[n,$,i.preview]),W=U((h,v)=>{if(!n||n.kind!=="step")return;const b=n.subEls.find(T=>T.id===h&&T.kind==="question");if(b&&b.kind==="question"&&b.variable){const T=b.options.find(B=>B.id===v);T&&y(B=>({...B,[b.variable]:T.label}))}i.preview||m.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:v,meta:{questionElId:h}});const L=O(e,n.id,v,h,l);L&&S(L)},[n,e,l,S]),M=U((h,v)=>{y(b=>({...b,[h]:v}))},[]),D=U(()=>{if(!n||n.kind!=="step")return;const h=O(e,n.id,null,null,l);h&&S(h)},[n,e,l,S]),C=U(()=>{if(!n||n.kind!=="step")return;const h=O(e,n.id,null,null,l);h&&S(h)},[n,e,l,S]),A=U(async h=>{if(!i.preview&&(m.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:h}}),t.providers.metaPixel?.pixelId&&ue("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&s))try{await zt(i.apiBaseUrl,s,h,t.providers.klaviyo.listId)}catch(v){console.warn("[quiz-runtime] Klaviyo subscribe failed:",v)}if(n&&n.kind==="step"){const v=O(e,n.id,null,null,l);v&&S(v)}},[n,e,l,S,s,t,i]),Ze=U(()=>{i.preview||m.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),u(h=>{if(h.length===0)return h;const v=h[h.length-1],b=h.slice(0,-1);if(o(v),v.kind==="step"){const L=$.findIndex(T=>T.id===v.id);L>=0&&p(L)}return b})},[n,$]),Je=U(h=>{if(i.preview){const v=h.redirectUrl||t.redirectUrl||"(no redirect URL)";z(`[Preview] Would redirect to: ${v}`);return}m.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&ue("CompleteRegistration",{content_name:t.metadata.title,value:0}),m.current?.flush().finally(()=>{const v=h.redirectUrl||t.redirectUrl||"",b=new URL(v,location.href);b.searchParams.set("utm_source","quiz"),b.searchParams.set("utm_campaign",document.title||"quiz"),s&&b.searchParams.set("utm_content",s),location.href=b.toString()})},[t,s,i.preview]);if(n?.kind==="exit"){const h=n;return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-content quiz-exit",children:[c("p",{class:"quiz-text",children:N("loadingResults",i.market)}),c("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>Je(h),children:N("seeResults",i.market)})]}),_&&c("div",{class:"quiz-preview-toast",children:_})]})}if(!n||n.kind!=="step")return c("div",{class:"quiz-shell",children:c("div",{class:"quiz-content",children:c("div",{class:"quiz-loading",children:c("div",{class:"quiz-loading-spinner"})})})});const xe=n,Ke=t.backNavigation&&r.length>0,Ye=t.providers.klaviyo?.captureAtStepId;return c("div",{class:"quiz-shell",children:[c("div",{class:"quiz-header",children:[Ke&&c("button",{class:"quiz-back-btn",type:"button",onClick:Ze,"aria-label":"Go back",children:"←"}),t.brandLogo?.enabled&&t.brandLogo.url&&c("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),t.stepProgressCount&&c("span",{class:"quiz-step-count",children:[a+1," / ",E]})]}),t.progressBar&&c(Ft,{current:a+1,total:E}),c("div",{class:"quiz-content",children:c(Ht,{node:xe,onAnswer:W,onLoadingComplete:D,onEmailSubmit:A,captureAtStepId:Ye,market:i.market,onContinue:C,variables:I,onVariableChange:M},xe.id)})]})}function Ne(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Mt(t);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}at(c(Rt,{data:e,settings:t,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Ne):Ne();
