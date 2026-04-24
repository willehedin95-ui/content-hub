var ne,g,Pe,P,ve,Ee,Ne,oe,Z,D,Ue,de,ae,le,X={},ee=[],Ve=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,ie=Array.isArray;function C(e,t){for(var n in t)e[n]=t[n];return e}function pe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Ze(e,t,n){var i,o,r,a={};for(r in t)r=="key"?i=t[r]:r=="ref"?o=t[r]:a[r]=t[r];if(arguments.length>2&&(a.children=arguments.length>3?ne.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(r in e.defaultProps)a[r]===void 0&&(a[r]=e.defaultProps[r]);return J(e,a,i,o,null)}function J(e,t,n,i,o){var r={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Pe,__i:-1,__u:0};return o==null&&g.vnode!=null&&g.vnode(r),r}function re(e){return e.children}function K(e,t){this.props=e,this.context=t}function M(e,t){if(t==null)return e.__?M(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?M(e):null}function Je(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],o=[],r=C({},t);r.__v=t.__v+1,g.vnode&&g.vnode(r),fe(e.__P,r,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??M(t),!!(32&t.__u),o),r.__v=t.__v,r.__.__k[r.__i]=r,Le(i,r,o),t.__e=t.__=null,r.__e!=n&&Ae(r)}}function Ae(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Ae(e)}function ge(e){(!e.__d&&(e.__d=!0)&&P.push(e)&&!te.__r++||ve!=g.debounceRendering)&&((ve=g.debounceRendering)||Ee)(te)}function te(){try{for(var e,t=1;P.length;)P.length>t&&P.sort(Ne),e=P.shift(),t=P.length,Je(e)}finally{P.length=te.__r=0}}function je(e,t,n,i,o,r,a,s,_,l,c){var u,f,d,y,w,z,h,v=i&&i.__k||ee,I=t.length;for(_=Ke(n,t,v,_,I),u=0;u<I;u++)(d=n.__k[u])!=null&&(f=d.__i!=-1&&v[d.__i]||X,d.__i=u,z=fe(e,d,f,o,r,a,s,_,l,c),y=d.__e,d.ref&&f.ref!=d.ref&&(f.ref&&he(f.ref,null,d),c.push(d.ref,d.__c||y,d)),w==null&&y!=null&&(w=y),(h=!!(4&d.__u))||f.__k===d.__k?(_=He(d,_,e,h),h&&f.__e&&(f.__e=null)):typeof d.type=="function"&&z!==void 0?_=z:y&&(_=y.nextSibling),d.__u&=-7);return n.__e=w,_}function Ke(e,t,n,i,o){var r,a,s,_,l,c=n.length,u=c,f=0;for(e.__k=new Array(o),r=0;r<o;r++)(a=t[r])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[r]=J(null,a,null,null,null):ie(a)?a=e.__k[r]=J(re,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[r]=J(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[r]=a,_=r+f,a.__=e,a.__b=e.__b+1,s=null,(l=a.__i=Ye(a,n,_,u))!=-1&&(u--,(s=n[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(o>c?f--:o<c&&f++),typeof a.type!="function"&&(a.__u|=4)):l!=_&&(l==_-1?f--:l==_+1?f++:(l>_?f--:f++,a.__u|=4))):e.__k[r]=null;if(u)for(r=0;r<c;r++)(s=n[r])!=null&&(2&s.__u)==0&&(s.__e==i&&(i=M(s)),Oe(s,s));return i}function He(e,t,n,i){var o,r;if(typeof e.type=="function"){for(o=e.__k,r=0;o&&r<o.length;r++)o[r]&&(o[r].__=e,t=He(o[r],t,n,i));return t}e.__e!=t&&(i&&(t&&e.type&&!t.parentNode&&(t=M(e)),n.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function Ye(e,t,n,i){var o,r,a,s=e.key,_=e.type,l=t[n],c=l!=null&&(2&l.__u)==0;if(l===null&&s==null||c&&s==l.key&&_==l.type)return n;if(i>(c?1:0)){for(o=n-1,r=n+1;o>=0||r<t.length;)if((l=t[a=o>=0?o--:r++])!=null&&(2&l.__u)==0&&s==l.key&&_==l.type)return a}return-1}function be(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||Ve.test(t)?n:n+"px"}function V(e,t,n,i,o){var r,a;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||be(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||be(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")r=t!=(t=t.replace(Ue,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+r]=n,n?i?n[D]=i[D]:(n[D]=de,e.addEventListener(t,r?le:ae,r)):e.removeEventListener(t,r?le:ae,r);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function ye(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[Z]==null)t[Z]=de++;else if(t[Z]<n[D])return;return n(g.event?g.event(t):t)}}}function fe(e,t,n,i,o,r,a,s,_,l){var c,u,f,d,y,w,z,h,v,I,$,N,Q,H,B,S=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(_=!!(32&n.__u),r=[s=t.__e=n.__e]),(c=g.__b)&&c(t);e:if(typeof S=="function")try{if(h=t.props,v=S.prototype&&S.prototype.render,I=(c=S.contextType)&&i[c.__c],$=c?I?I.props.value:c.__:i,n.__c?z=(u=t.__c=n.__c).__=u.__E:(v?t.__c=u=new S(h,$):(t.__c=u=new K(h,$),u.constructor=S,u.render=et),I&&I.sub(u),u.state||(u.state={}),u.__n=i,f=u.__d=!0,u.__h=[],u._sb=[]),v&&u.__s==null&&(u.__s=u.state),v&&S.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=C({},u.__s)),C(u.__s,S.getDerivedStateFromProps(h,u.__s))),d=u.props,y=u.state,u.__v=t,f)v&&S.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),v&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(v&&S.getDerivedStateFromProps==null&&h!==d&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(h,$),t.__v==n.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(h,u.__s,$)===!1){t.__v!=n.__v&&(u.props=h,u.state=u.__s,u.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(T){T&&(T.__=t)}),ee.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&a.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(h,u.__s,$),v&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(d,y,w)})}if(u.context=$,u.props=h,u.__P=e,u.__e=!1,N=g.__r,Q=0,v)u.state=u.__s,u.__d=!1,N&&N(t),c=u.render(u.props,u.state,u.context),ee.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,N&&N(t),c=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++Q<25);u.state=u.__s,u.getChildContext!=null&&(i=C(C({},i),u.getChildContext())),v&&!f&&u.getSnapshotBeforeUpdate!=null&&(w=u.getSnapshotBeforeUpdate(d,y)),H=c!=null&&c.type===re&&c.key==null?Fe(c.props.children):c,s=je(e,ie(H)?H:[H],t,n,i,o,r,a,s,_,l),u.base=t.__e,t.__u&=-161,u.__h.length&&a.push(u),z&&(u.__E=u.__=null)}catch(T){if(t.__v=null,_||r!=null)if(T.then){for(t.__u|=_?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;r[r.indexOf(s)]=null,t.__e=s}else{for(B=r.length;B--;)pe(r[B]);_e(t)}else t.__e=n.__e,t.__k=n.__k,T.then||_e(t);g.__e(T,t,n)}else r==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):s=t.__e=Xe(n.__e,t,n,i,o,r,a,_,l);return(c=g.diffed)&&c(t),128&t.__u?void 0:s}function _e(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(_e))}function Le(e,t,n){for(var i=0;i<n.length;i++)he(n[i],n[++i],n[++i]);g.__c&&g.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(r){r.call(o)})}catch(r){g.__e(r,o.__v)}})}function Fe(e){return typeof e!="object"||e==null||e.__b>0?e:ie(e)?e.map(Fe):C({},e)}function Xe(e,t,n,i,o,r,a,s,_){var l,c,u,f,d,y,w,z=n.props||X,h=t.props,v=t.type;if(v=="svg"?o="http://www.w3.org/2000/svg":v=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((d=r[l])&&"setAttribute"in d==!!v&&(v?d.localName==v:d.nodeType==3)){e=d,r[l]=null;break}}if(e==null){if(v==null)return document.createTextNode(h);e=document.createElementNS(o,v,h.is&&h),s&&(g.__m&&g.__m(t,r),s=!1),r=null}if(v==null)z===h||s&&e.data==h||(e.data=h);else{if(r=r&&ne.call(e.childNodes),!s&&r!=null)for(z={},l=0;l<e.attributes.length;l++)z[(d=e.attributes[l]).name]=d.value;for(l in z)d=z[l],l=="dangerouslySetInnerHTML"?u=d:l=="children"||l in h||l=="value"&&"defaultValue"in h||l=="checked"&&"defaultChecked"in h||V(e,l,null,d,o);for(l in h)d=h[l],l=="children"?f=d:l=="dangerouslySetInnerHTML"?c=d:l=="value"?y=d:l=="checked"?w=d:s&&typeof d!="function"||z[l]===d||V(e,l,d,z[l],o);if(c)s||u&&(c.__html==u.__html||c.__html==e.innerHTML)||(e.innerHTML=c.__html),t.__k=[];else if(u&&(e.innerHTML=""),je(t.type=="template"?e.content:e,ie(f)?f:[f],t,n,i,v=="foreignObject"?"http://www.w3.org/1999/xhtml":o,r,a,r?r[0]:n.__k&&M(n,0),s,_),r!=null)for(l=r.length;l--;)pe(r[l]);s||(l="value",v=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[l]||v=="progress"&&!y||v=="option"&&y!=z[l])&&V(e,l,y,z[l],o),l="checked",w!=null&&w!=e[l]&&V(e,l,w,z[l],o))}return e}function he(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(o){g.__e(o,n)}}function Oe(e,t,n){var i,o;if(g.unmount&&g.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||he(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(r){g.__e(r,t)}i.base=i.__P=null}if(i=e.__k)for(o=0;o<i.length;o++)i[o]&&Oe(i[o],t,n||typeof e.type!="function");n||pe(e.__e),e.__c=e.__=e.__e=void 0}function et(e,t,n){return this.constructor(e,n)}function tt(e,t,n){var i,o,r,a;t==document&&(t=document.documentElement),g.__&&g.__(e,t),o=(i=!1)?null:t.__k,r=[],a=[],fe(t,e=t.__k=Ze(re,null,[e]),o||X,X,t.namespaceURI,o?null:t.firstChild?ne.call(t.childNodes):null,r,o?o.__e:t.firstChild,i,a),Le(r,e,a)}ne=ee.slice,g={__e:function(e,t,n,i){for(var o,r,a;t=t.__;)if((o=t.__c)&&!o.__)try{if((r=o.constructor)&&r.getDerivedStateFromError!=null&&(o.setState(r.getDerivedStateFromError(e)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,i||{}),a=o.__d),a)return o.__E=o}catch(s){e=s}throw e}},Pe=0,K.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=C({},this.state),typeof e=="function"&&(e=e(C({},n),this.props)),e&&C(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),ge(this))},K.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),ge(this))},K.prototype.render=re,P=[],Ee=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ne=function(e,t){return e.__v.__b-t.__v.__b},te.__r=0,oe=Math.random().toString(8),Z="__d"+oe,D="__a"+oe,Ue=/(PointerCapture)$|Capture$/i,de=0,ae=ye(!1),le=ye(!0);var nt=0;function p(e,t,n,i,o,r){t||(t={});var a,s,_=t;if("ref"in _)for(s in _={},t)s=="ref"?a=t[s]:_[s]=t[s];var l={type:e,props:_,key:n,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--nt,__i:-1,__u:0,__source:o,__self:r};if(typeof e=="function"&&(a=e.defaultProps))for(s in a)_[s]===void 0&&(_[s]=a[s]);return g.vnode&&g.vnode(l),l}var R,x,se,xe,G=0,Me=[],k=g,ze=k.__b,qe=k.__r,ke=k.diffed,we=k.__c,Se=k.unmount,Ie=k.__;function me(e,t){k.__h&&k.__h(x,e,G||t),G=0;var n=x.__H||(x.__H={__:[],__h:[]});return e>=n.__.length&&n.__.push({}),n.__[e]}function E(e){return G=1,it(Re,e)}function it(e,t,n){var i=me(R++,2);if(i.t=e,!i.__c&&(i.__=[Re(void 0,t),function(s){var _=i.__N?i.__N[0]:i.__[0],l=i.t(_,s);_!==l&&(i.__N=[l,i.__[1]],i.__c.setState({}))}],i.__c=x,!x.__f)){var o=function(s,_,l){if(!i.__c.__H)return!0;var c=i.__c.__H.__.filter(function(f){return f.__c});if(c.every(function(f){return!f.__N}))return!r||r.call(this,s,_,l);var u=i.__c.props!==s;return c.some(function(f){if(f.__N){var d=f.__[0];f.__=f.__N,f.__N=void 0,d!==f.__[0]&&(u=!0)}}),r&&r.call(this,s,_,l)||u};x.__f=!0;var r=x.shouldComponentUpdate,a=x.componentWillUpdate;x.componentWillUpdate=function(s,_,l){if(this.__e){var c=r;r=void 0,o(s,_,l),r=c}a&&a.call(this,s,_,l)},x.shouldComponentUpdate=o}return i.__N||i.__}function A(e,t){var n=me(R++,3);!k.__s&&De(n.__H,t)&&(n.__=e,n.u=t,x.__H.__h.push(n))}function W(e){return G=5,Be(function(){return{current:e}},[])}function Be(e,t){var n=me(R++,7);return De(n.__H,t)&&(n.__=e(),n.__H=t,n.__h=e),n.__}function U(e,t){return G=8,Be(function(){return e},t)}function rt(){for(var e;e=Me.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(Y),t.__h.some(ce),t.__h=[]}catch(n){t.__h=[],k.__e(n,e.__v)}}}k.__b=function(e){x=null,ze&&ze(e)},k.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Ie&&Ie(e,t)},k.__r=function(e){qe&&qe(e),R=0;var t=(x=e.__c).__H;t&&(se===x?(t.__h=[],x.__h=[],t.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})):(t.__h.some(Y),t.__h.some(ce),t.__h=[],R=0)),se=x},k.diffed=function(e){ke&&ke(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(Me.push(t)!==1&&xe===k.requestAnimationFrame||((xe=k.requestAnimationFrame)||ot)(rt)),t.__H.__.some(function(n){n.u&&(n.__H=n.u),n.u=void 0})),se=x=null},k.__c=function(e,t){t.some(function(n){try{n.__h.some(Y),n.__h=n.__h.filter(function(i){return!i.__||ce(i)})}catch(i){t.some(function(o){o.__h&&(o.__h=[])}),t=[],k.__e(i,n.__v)}}),we&&we(e,t)},k.unmount=function(e){Se&&Se(e);var t,n=e.__c;n&&n.__H&&(n.__H.__.some(function(i){try{Y(i)}catch(o){t=o}}),n.__H=void 0,t&&k.__e(t,n.__v))};var $e=typeof requestAnimationFrame=="function";function ot(e){var t,n=function(){clearTimeout(i),$e&&cancelAnimationFrame(t),setTimeout(e)},i=setTimeout(n,35);$e&&(t=requestAnimationFrame(n))}function Y(e){var t=x,n=e.__c;typeof n=="function"&&(e.__c=void 0,n()),x=t}function ce(e){var t=x;e.__c=e.__(),x=t}function De(e,t){return!e||e.length!==t.length||t.some(function(n,i){return n!==e[i]})}function Re(e,t){return typeof t=="function"?t(e):t}function st(e){const t=e.reduce((i,o)=>i+(o.trafficPct??0),0);if(t<=0)return e[0];let n=Math.random()*t;for(const i of e)if(n-=i.trafficPct??0,n<=0)return i;return e[e.length-1]}function ut(e,t){const n={};for(const o of Object.values(e.nodes)){if(o.kind!=="step"||!o.variantGroupId)continue;const r=o.variantGroupId;n[r]||(n[r]=[]),n[r].push(o)}const i={};for(const[o,r]of Object.entries(n)){const a=`quiz_${t}_vg_${o}`,s=localStorage.getItem(a);if(s&&e.nodes[s])i[o]=s;else{const _=st(r);localStorage.setItem(a,_.id),i[o]=_.id}}return i}function at(e,t){return Object.values(e.edges).filter(n=>n.from===t)}function lt(e,t,n){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===n:!1}function O(e,t,n,i,o){const r=at(e,t);if(r.length===0)return null;if(n!==null){const s=r.find(_=>lt(_.condition,n,i));if(s)return Ce(e,s.to,o)}const a=r.find(s=>!s.condition||s.condition.kind==="default")??r[0];return Ce(e,a.to,o)}function Ce(e,t,n){const i=e.nodes[t];if(!i)return null;if(i.kind!=="step")return i;if(i.variantGroupId){const o=n[i.variantGroupId];if(o)return e.nodes[o]??i}return i}function _t(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function ct(){const e=new URLSearchParams(location.search),t={},n=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const i of n){const o=e.get(i);o&&(t[i]=o)}return t}class dt{constructor(t,n){this.sessionId=t,this.flushFn=n,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function pt(e,t,n,i,o){const r=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:n,utm:i,ua:navigator.userAgent,market:o})});if(!r.ok)throw new Error(`session start failed: ${r.status}`);return(await r.json()).session_id}async function ft(e,t,n){const i={session_id:t,events:n.map(r=>({event_type:r.event_type,step_id:r.step_id,variant_group_id:r.variant_group_id,option_id:r.option_id,meta:r.meta}))},o=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i),keepalive:!0});if(!o.ok)throw new Error(`events flush failed: ${o.status}`)}async function ht(e,t,n,i){const o=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:n,listId:i})});if(!o.ok)throw new Error(`klaviyo subscribe failed: ${o.status}`)}const mt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."}};function j(e,t){const n=t??"en",i=mt[e];return n in i?i[n]:i.en}function Ge(e){if(!e)return;const t=n=>{n.removeAttribute("class");const i=n.getAttribute("style");if(i){const o=i.split(";").map(r=>r.trim()).filter(r=>/^color\s*:/i.test(r)).join("; ");o?n.setAttribute("style",o):n.removeAttribute("style")}for(const o of Array.from(n.children))t(o)};for(const n of Array.from(e.children))t(n)}function vt({el:e}){const t=W(null);return A(()=>{t.current&&(t.current.innerHTML=e.text,Ge(t.current))},[e.text]),p("h1",{ref:t,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function gt({el:e}){const t=W(null);return A(()=>{t.current&&(t.current.innerHTML=e.text,Ge(t.current))},[e.text]),p("div",{ref:t,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function bt({el:e}){return p("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function yt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const n of t)for(const i of Array.from(e.querySelectorAll(n)))i.parentNode?.removeChild(i);e.innerText.trim().length===0&&(e.style.display="none")}function xt({el:e}){const t=W(null);return A(()=>{t.current&&(t.current.innerHTML=e.html,yt(t.current))},[e.html]),p("div",{ref:t,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function zt({el:e,onComplete:t}){return A(()=>{const n=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(n)},[e.seconds,t]),p("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[p("div",{class:"quiz-loading-spinner"}),e.text&&p("p",{class:"quiz-loading-text",children:e.text})]})}function qt({option:e,layout:t,selected:n,onClick:i}){const o=["quiz-option",`quiz-option--${t}`,n?"quiz-option--selected":""].filter(Boolean).join(" ");return p("button",{class:o,"data-quiz-opt-id":e.id,onClick:i,type:"button",children:[t==="image_cards"&&e.imageUrl&&p("img",{src:e.imageUrl,alt:e.label,class:"quiz-option-img"}),e.emoji&&p("span",{class:"quiz-option-emoji",children:e.emoji}),p("span",{class:"quiz-option-label",children:e.label})]})}function kt({el:e,onAnswer:t,market:n}){const[i,o]=E(new Set),r=a=>{e.kindOf==="single"?(o(new Set([a])),setTimeout(()=>t(e.id,a),200)):o(s=>{const _=new Set(s);return _.has(a)?_.delete(a):_.add(a),_})};return p("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[e.options.map(a=>p(qt,{option:a,layout:e.layout,selected:i.has(a.id),onClick:()=>r(a.id)},a.id)),e.kindOf==="multi"&&i.size>0&&p("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>{const a=[...i][0];t(e.id,a)},children:j("continue",n)})]})}function wt({onSubmit:e,market:t}){const[n,i]=E(""),[o,r]=E("");return p("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!n.includes("@")){r(j("invalidEmail",t));return}r(""),e(n)},novalidate:!0,children:[p("input",{type:"email",class:"quiz-email-input",placeholder:j("emailPlaceholder",t),value:n,onInput:s=>i(s.target.value),required:!0}),o&&p("p",{class:"quiz-email-error",children:o}),p("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:j("continue",t)})]})}function St({node:e,onAnswer:t,onLoadingComplete:n,onEmailSubmit:i,captureAtStepId:o,market:r,onContinue:a}){const s=e.subEls.some(c=>c.kind==="question"),_=e.subEls.some(c=>c.kind==="loading"),l=!s&&!_&&typeof a=="function";return p("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(c=>{switch(c.kind){case"title":return p(vt,{el:c},c.id);case"text":return p(gt,{el:c},c.id);case"image":return p(bt,{el:c},c.id);case"custom_html":return p(xt,{el:c},c.id);case"loading":return p(zt,{el:c,onComplete:n},c.id);case"question":return p(kt,{el:c,onAnswer:t,market:r},c.id)}}),o===e.id&&p(wt,{onSubmit:i,market:r}),l&&p("div",{class:"quiz-continue-wrap",children:p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,children:j("continue",r)})})]})}function It({current:e,total:t}){const n=t>0?Math.round(e/t*100):0;return p("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":n,"aria-valuemax":100,children:p("div",{class:"quiz-progress-bar",style:{width:`${n}%`}})})}function $t(e){const{brandColors:t,fontSettings:n}=e,i=n.enabled&&n.fontFamily?n.fontFamily:"Inter, system-ui, sans-serif";if(n.enabled&&n.fontFamily&&n.fontFamily!=="Inter"){const r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(n.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(r)}const o=document.createElement("style");o.textContent=`
:root {
  --quiz-bg: ${t.background};
  --quiz-text-primary: ${t.textPrimary};
  --quiz-text-secondary: ${t.textSecondary};
  --quiz-brand: ${t.primaryBrand};
  --quiz-option-bg: ${t.optionBackground};
  --quiz-font: ${i};
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

@media (max-width: 480px) {
  .quiz-content { padding: 20px 10px 48px; }
}
  `,document.head.appendChild(o)}function Ct(e){const t=Object.values(e.nodes).filter(s=>s.kind==="step"),n=new Set(t.map(s=>s.id)),i=Object.values(e.nodes).find(s=>s.kind==="start"),o=[];if(i)for(const s of Object.values(e.edges))s.from===i.id&&n.has(s.to)&&o.push(s.to);else for(const s of t)o.push(s.id);const r=new Set,a=[];for(;o.length;){const s=o.shift();if(r.has(s))continue;r.add(s);const _=e.nodes[s];_&&_.kind==="step"&&a.push(_);for(const l of Object.values(e.edges))l.from===s&&n.has(l.to)&&!r.has(l.to)&&o.push(l.to)}for(const s of t)r.has(s.id)||a.push(s);return a}function ue(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function Tt({data:e,settings:t,config:n}){const[i,o]=E(null),[r,a]=E([]),[s,_]=E(null),[l,c]=E({}),[u,f]=E(0),d=W(null),y=W(!1),w=Ct(e),z=w.length;A(()=>{if(y.current)return;y.current=!0;const m=ut(e,n.quizId);c(m);const b=_t(e);if(!b){console.error("[quiz-runtime] No start node found");return}const q=O(e,b.id,null,null,m);if(o(q),!n.preview&&t.providers.metaPixel?.pixelId&&ue("PageView",{}),n.preview)return;const L=ct();pt(n.apiBaseUrl,n.quizId,m,L,e.id??"").then(F=>{_(F),d.current=new dt(F,(We,Qe)=>ft(n.apiBaseUrl,We,Qe)),q&&q.kind==="step"&&d.current.push({event_type:"step_view",step_id:q.id,variant_group_id:q.variantGroupId})}).catch(F=>{console.warn("[quiz-runtime] session start failed:",F)})},[]),A(()=>()=>d.current?.destroy(),[]),A(()=>{if(!i||i.kind!=="step")return;const m=i;if(m.subEls.length===0){const b=O(e,m.id,null,null,l);b&&b.id!==i.id&&h(b,!1)}},[i]);const h=U((m,b=!0)=>{if(b&&i&&a(q=>[...q,i]),o(m),m.kind==="step"){const q=w.findIndex(L=>L.id===m.id);q>=0&&f(q),n.preview||d.current?.push({event_type:"step_view",step_id:m.id,variant_group_id:m.variantGroupId})}},[i,w,n.preview]),v=U((m,b)=>{if(!i||i.kind!=="step")return;n.preview||d.current?.push({event_type:"answer",step_id:i.id,variant_group_id:i.variantGroupId,option_id:b,meta:{questionElId:m}});const q=O(e,i.id,b,m,l);q&&h(q)},[i,e,l,h]),I=U(()=>{if(!i||i.kind!=="step")return;const m=O(e,i.id,null,null,l);m&&h(m)},[i,e,l,h]),$=U(()=>{if(!i||i.kind!=="step")return;const m=O(e,i.id,null,null,l);m&&h(m)},[i,e,l,h]),N=U(async m=>{if(!n.preview&&(d.current?.push({event_type:"email_capture",step_id:i?.kind==="step"?i.id:void 0,meta:{email:m}}),t.providers.metaPixel?.pixelId&&ue("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&s))try{await ht(n.apiBaseUrl,s,m,t.providers.klaviyo.listId)}catch(b){console.warn("[quiz-runtime] Klaviyo subscribe failed:",b)}if(i&&i.kind==="step"){const b=O(e,i.id,null,null,l);b&&h(b)}},[i,e,l,h,s,t,n]),Q=U(()=>{n.preview||d.current?.push({event_type:"back",step_id:i?.kind==="step"?i.id:void 0}),a(m=>{if(m.length===0)return m;const b=m[m.length-1],q=m.slice(0,-1);if(o(b),b.kind==="step"){const L=w.findIndex(F=>F.id===b.id);L>=0&&f(L)}return q})},[i,w]),H=U(m=>{if(n.preview){const b=m.redirectUrl||t.redirectUrl||"(no redirect URL)";alert(`[Preview] Would redirect to:
${b}`);return}d.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&ue("CompleteRegistration",{content_name:t.metadata.title,value:0}),d.current?.flush().finally(()=>{const b=m.redirectUrl||t.redirectUrl||"",q=new URL(b,location.href);q.searchParams.set("utm_source","quiz"),q.searchParams.set("utm_campaign",document.title||"quiz"),s&&q.searchParams.set("utm_content",s),location.href=q.toString()})},[t,s,n.preview]);if(i?.kind==="exit"){const m=i;return p("div",{class:"quiz-shell",children:p("div",{class:"quiz-content quiz-exit",children:[p("p",{class:"quiz-text",children:j("loadingResults",n.market)}),p("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:()=>H(m),children:j("seeResults",n.market)})]})})}if(!i||i.kind!=="step")return p("div",{class:"quiz-shell",children:p("div",{class:"quiz-content",children:p("div",{class:"quiz-loading",children:p("div",{class:"quiz-loading-spinner"})})})});const B=i,S=t.backNavigation&&r.length>0,T=t.providers.klaviyo?.captureAtStepId;return p("div",{class:"quiz-shell",children:[p("div",{class:"quiz-header",children:[S&&p("button",{class:"quiz-back-btn",type:"button",onClick:Q,"aria-label":"Go back",children:"←"}),t.brandLogo?.enabled&&t.brandLogo.url&&p("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),t.stepProgressCount&&p("span",{class:"quiz-step-count",children:[u+1," / ",z]})]}),t.progressBar&&p(It,{current:u+1,total:z}),p("div",{class:"quiz-content",children:p(St,{node:B,onAnswer:v,onLoadingComplete:I,onEmailSubmit:N,captureAtStepId:T,market:n.market,onContinue:$})})]})}function Te(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,n=window.__QUIZ_CONFIG__;if(!e||!t||!n){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}$t(t);const i=document.getElementById("quiz-root");if(!i){console.error("[quiz-runtime] #quiz-root element not found");return}tt(p(Tt,{data:e,settings:t,config:n}),i)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Te):Te();
