var re,y,Oe,U,ve,Ue,He,ue,X,V,Me,me,pe,_e,ie={},ne=[],nt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,se=Array.isArray;function L(e,t){for(var i in t)e[i]=t[i];return e}function ge(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function ot(e,t,i){var n,r,o,a={};for(o in t)o=="key"?n=t[o]:o=="ref"?r=t[o]:a[o]=t[o];if(arguments.length>2&&(a.children=arguments.length>3?re.call(arguments,2):i),typeof e=="function"&&e.defaultProps!=null)for(o in e.defaultProps)a[o]===void 0&&(a[o]=e.defaultProps[o]);return Y(e,a,n,r,null)}function Y(e,t,i,n,r){var o={type:e,props:t,key:i,ref:n,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:r??++Oe,__i:-1,__u:0};return r==null&&y.vnode!=null&&y.vnode(o),o}function ae(e){return e.children}function ee(e,t){this.props=e,this.context=t}function B(e,t){if(t==null)return e.__?B(e.__,e.__i+1):null;for(var i;t<e.__k.length;t++)if((i=e.__k[t])!=null&&i.__e!=null)return i.__e;return typeof e.type=="function"?B(e):null}function rt(e){if(e.__P&&e.__d){var t=e.__v,i=t.__e,n=[],r=[],o=L({},t);o.__v=t.__v+1,y.vnode&&y.vnode(o),be(e.__P,o,t,e.__n,e.__P.namespaceURI,32&t.__u?[i]:null,n,i??B(t),!!(32&t.__u),r),o.__v=t.__v,o.__.__k[o.__i]=o,Ge(n,o,r),t.__e=t.__=null,o.__e!=i&&De(o)}}function De(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),De(e)}function ye(e){(!e.__d&&(e.__d=!0)&&U.push(e)&&!oe.__r++||ve!=y.debounceRendering)&&((ve=y.debounceRendering)||Ue)(oe)}function oe(){try{for(var e,t=1;U.length;)U.length>t&&U.sort(He),e=U.shift(),t=U.length,rt(e)}finally{U.length=oe.__r=0}}function Be(e,t,i,n,r,o,a,s,c,l,_){var u,f,p,q,h,w,g,x=n&&n.__k||ne,b=t.length;for(c=st(i,t,x,c,b),u=0;u<b;u++)(p=i.__k[u])!=null&&(f=p.__i!=-1&&x[p.__i]||ie,p.__i=u,w=be(e,p,f,r,o,a,s,c,l,_),q=p.__e,p.ref&&f.ref!=p.ref&&(f.ref&&ze(f.ref,null,p),_.push(p.ref,p.__c||q,p)),h==null&&q!=null&&(h=q),(g=!!(4&p.__u))||f.__k===p.__k?(c=Re(p,c,e,g),g&&f.__e&&(f.__e=null)):typeof p.type=="function"&&w!==void 0?c=w:q&&(c=q.nextSibling),p.__u&=-7);return i.__e=h,c}function st(e,t,i,n,r){var o,a,s,c,l,_=i.length,u=_,f=0;for(e.__k=new Array(r),o=0;o<r;o++)(a=t[o])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[o]=Y(null,a,null,null,null):se(a)?a=e.__k[o]=Y(ae,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[o]=Y(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[o]=a,c=o+f,a.__=e,a.__b=e.__b+1,s=null,(l=a.__i=at(a,i,c,u))!=-1&&(u--,(s=i[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(r>_?f--:r<_&&f++),typeof a.type!="function"&&(a.__u|=4)):l!=c&&(l==c-1?f--:l==c+1?f++:(l>c?f--:f++,a.__u|=4))):e.__k[o]=null;if(u)for(o=0;o<_;o++)(s=i[o])!=null&&(2&s.__u)==0&&(s.__e==n&&(n=B(s)),Qe(s,s));return n}function Re(e,t,i,n){var r,o;if(typeof e.type=="function"){for(r=e.__k,o=0;r&&o<r.length;o++)r[o]&&(r[o].__=e,t=Re(r[o],t,i,n));return t}e.__e!=t&&(n&&(t&&e.type&&!t.parentNode&&(t=B(e)),i.insertBefore(e.__e,t||null)),t=e.__e);do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function at(e,t,i,n){var r,o,a,s=e.key,c=e.type,l=t[i],_=l!=null&&(2&l.__u)==0;if(l===null&&s==null||_&&s==l.key&&c==l.type)return i;if(n>(_?1:0)){for(r=i-1,o=i+1;r>=0||o<t.length;)if((l=t[a=r>=0?r--:o++])!=null&&(2&l.__u)==0&&s==l.key&&c==l.type)return a}return-1}function we(e,t,i){t[0]=="-"?e.setProperty(t,i??""):e[t]=i==null?"":typeof i!="number"||nt.test(t)?i:i+"px"}function K(e,t,i,n,r){var o,a;e:if(t=="style")if(typeof i=="string")e.style.cssText=i;else{if(typeof n=="string"&&(e.style.cssText=n=""),n)for(t in n)i&&t in i||we(e.style,t,"");if(i)for(t in i)n&&i[t]==n[t]||we(e.style,t,i[t])}else if(t[0]=="o"&&t[1]=="n")o=t!=(t=t.replace(Me,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+o]=i,i?n?i[V]=n[V]:(i[V]=me,e.addEventListener(t,o?_e:pe,o)):e.removeEventListener(t,o?_e:pe,o);else{if(r=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=i??"";break e}catch{}typeof i=="function"||(i==null||i===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&i==1?"":i))}}function ke(e){return function(t){if(this.l){var i=this.l[t.type+e];if(t[X]==null)t[X]=me++;else if(t[X]<i[V])return;return i(y.event?y.event(t):t)}}}function be(e,t,i,n,r,o,a,s,c,l){var _,u,f,p,q,h,w,g,x,b,C,$,J,D,R,F=t.type;if(t.constructor!==void 0)return null;128&i.__u&&(c=!!(32&i.__u),o=[s=t.__e=i.__e]),(_=y.__b)&&_(t);e:if(typeof F=="function")try{if(g=t.props,x=F.prototype&&F.prototype.render,b=(_=F.contextType)&&n[_.__c],C=_?b?b.props.value:_.__:n,i.__c?w=(u=t.__c=i.__c).__=u.__E:(x?t.__c=u=new F(g,C):(t.__c=u=new ee(g,C),u.constructor=F,u.render=lt),b&&b.sub(u),u.state||(u.state={}),u.__n=n,f=u.__d=!0,u.__h=[],u._sb=[]),x&&u.__s==null&&(u.__s=u.state),x&&F.getDerivedStateFromProps!=null&&(u.__s==u.state&&(u.__s=L({},u.__s)),L(u.__s,F.getDerivedStateFromProps(g,u.__s))),p=u.props,q=u.state,u.__v=t,f)x&&F.getDerivedStateFromProps==null&&u.componentWillMount!=null&&u.componentWillMount(),x&&u.componentDidMount!=null&&u.__h.push(u.componentDidMount);else{if(x&&F.getDerivedStateFromProps==null&&g!==p&&u.componentWillReceiveProps!=null&&u.componentWillReceiveProps(g,C),t.__v==i.__v||!u.__e&&u.shouldComponentUpdate!=null&&u.shouldComponentUpdate(g,u.__s,C)===!1){t.__v!=i.__v&&(u.props=g,u.state=u.__s,u.__d=!1),t.__e=i.__e,t.__k=i.__k,t.__k.some(function(j){j&&(j.__=t)}),ne.push.apply(u.__h,u._sb),u._sb=[],u.__h.length&&a.push(u);break e}u.componentWillUpdate!=null&&u.componentWillUpdate(g,u.__s,C),x&&u.componentDidUpdate!=null&&u.__h.push(function(){u.componentDidUpdate(p,q,h)})}if(u.context=C,u.props=g,u.__P=e,u.__e=!1,$=y.__r,J=0,x)u.state=u.__s,u.__d=!1,$&&$(t),_=u.render(u.props,u.state,u.context),ne.push.apply(u.__h,u._sb),u._sb=[];else do u.__d=!1,$&&$(t),_=u.render(u.props,u.state,u.context),u.state=u.__s;while(u.__d&&++J<25);u.state=u.__s,u.getChildContext!=null&&(n=L(L({},n),u.getChildContext())),x&&!f&&u.getSnapshotBeforeUpdate!=null&&(h=u.getSnapshotBeforeUpdate(p,q)),D=_!=null&&_.type===ae&&_.key==null?Ve(_.props.children):_,s=Be(e,se(D)?D:[D],t,i,n,r,o,a,s,c,l),u.base=t.__e,t.__u&=-161,u.__h.length&&a.push(u),w&&(u.__E=u.__=null)}catch(j){if(t.__v=null,c||o!=null)if(j.then){for(t.__u|=c?160:128;s&&s.nodeType==8&&s.nextSibling;)s=s.nextSibling;o[o.indexOf(s)]=null,t.__e=s}else{for(R=o.length;R--;)ge(o[R]);fe(t)}else t.__e=i.__e,t.__k=i.__k,j.then||fe(t);y.__e(j,t,i)}else o==null&&t.__v==i.__v?(t.__k=i.__k,t.__e=i.__e):s=t.__e=ut(i.__e,t,i,n,r,o,a,c,l);return(_=y.diffed)&&_(t),128&t.__u?void 0:s}function fe(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(fe))}function Ge(e,t,i){for(var n=0;n<i.length;n++)ze(i[n],i[++n],i[++n]);y.__c&&y.__c(t,e),e.some(function(r){try{e=r.__h,r.__h=[],e.some(function(o){o.call(r)})}catch(o){y.__e(o,r.__v)}})}function Ve(e){return typeof e!="object"||e==null||e.__b>0?e:se(e)?e.map(Ve):L({},e)}function ut(e,t,i,n,r,o,a,s,c){var l,_,u,f,p,q,h,w=i.props||ie,g=t.props,x=t.type;if(x=="svg"?r="http://www.w3.org/2000/svg":x=="math"?r="http://www.w3.org/1998/Math/MathML":r||(r="http://www.w3.org/1999/xhtml"),o!=null){for(l=0;l<o.length;l++)if((p=o[l])&&"setAttribute"in p==!!x&&(x?p.localName==x:p.nodeType==3)){e=p,o[l]=null;break}}if(e==null){if(x==null)return document.createTextNode(g);e=document.createElementNS(r,x,g.is&&g),s&&(y.__m&&y.__m(t,o),s=!1),o=null}if(x==null)w===g||s&&e.data==g||(e.data=g);else{if(o=o&&re.call(e.childNodes),!s&&o!=null)for(w={},l=0;l<e.attributes.length;l++)w[(p=e.attributes[l]).name]=p.value;for(l in w)p=w[l],l=="dangerouslySetInnerHTML"?u=p:l=="children"||l in g||l=="value"&&"defaultValue"in g||l=="checked"&&"defaultChecked"in g||K(e,l,null,p,r);for(l in g)p=g[l],l=="children"?f=p:l=="dangerouslySetInnerHTML"?_=p:l=="value"?q=p:l=="checked"?h=p:s&&typeof p!="function"||w[l]===p||K(e,l,p,w[l],r);if(_)s||u&&(_.__html==u.__html||_.__html==e.innerHTML)||(e.innerHTML=_.__html),t.__k=[];else if(u&&(e.innerHTML=""),Be(t.type=="template"?e.content:e,se(f)?f:[f],t,i,n,x=="foreignObject"?"http://www.w3.org/1999/xhtml":r,o,a,o?o[0]:i.__k&&B(i,0),s,c),o!=null)for(l=o.length;l--;)ge(o[l]);s||(l="value",x=="progress"&&q==null?e.removeAttribute("value"):q!=null&&(q!==e[l]||x=="progress"&&!q||x=="option"&&q!=w[l])&&K(e,l,q,w[l],r),l="checked",h!=null&&h!=e[l]&&K(e,l,h,w[l],r))}return e}function ze(e,t,i){try{if(typeof e=="function"){var n=typeof e.__u=="function";n&&e.__u(),n&&t==null||(e.__u=e(t))}else e.current=t}catch(r){y.__e(r,i)}}function Qe(e,t,i){var n,r;if(y.unmount&&y.unmount(e),(n=e.ref)&&(n.current&&n.current!=e.__e||ze(n,null,t)),(n=e.__c)!=null){if(n.componentWillUnmount)try{n.componentWillUnmount()}catch(o){y.__e(o,t)}n.base=n.__P=null}if(n=e.__k)for(r=0;r<n.length;r++)n[r]&&Qe(n[r],t,i||typeof e.type!="function");i||ge(e.__e),e.__c=e.__=e.__e=void 0}function lt(e,t,i){return this.constructor(e,i)}function dt(e,t,i){var n,r,o,a;t==document&&(t=document.documentElement),y.__&&y.__(e,t),r=(n=!1)?null:t.__k,o=[],a=[],be(t,e=t.__k=ot(ae,null,[e]),r||ie,ie,t.namespaceURI,r?null:t.firstChild?re.call(t.childNodes):null,o,r?r.__e:t.firstChild,n,a),Ge(o,e,a)}re=ne.slice,y={__e:function(e,t,i,n){for(var r,o,a;t=t.__;)if((r=t.__c)&&!r.__)try{if((o=r.constructor)&&o.getDerivedStateFromError!=null&&(r.setState(o.getDerivedStateFromError(e)),a=r.__d),r.componentDidCatch!=null&&(r.componentDidCatch(e,n||{}),a=r.__d),a)return r.__E=r}catch(s){e=s}throw e}},Oe=0,ee.prototype.setState=function(e,t){var i;i=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=L({},this.state),typeof e=="function"&&(e=e(L({},i),this.props)),e&&L(i,e),e!=null&&this.__v&&(t&&this._sb.push(t),ye(this))},ee.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),ye(this))},ee.prototype.render=ae,U=[],Ue=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,He=function(e,t){return e.__v.__b-t.__v.__b},oe.__r=0,ue=Math.random().toString(8),X="__d"+ue,V="__a"+ue,Me=/(PointerCapture)$|Capture$/i,me=0,pe=ke(!1),_e=ke(!0);var ct=0;function d(e,t,i,n,r,o){t||(t={});var a,s,c=t;if("ref"in c)for(s in c={},t)s=="ref"?a=t[s]:c[s]=t[s];var l={type:e,props:c,key:i,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ct,__i:-1,__u:0,__source:r,__self:o};if(typeof e=="function"&&(a=e.defaultProps))for(s in a)c[s]===void 0&&(c[s]=a[s]);return y.vnode&&y.vnode(l),l}var Q,k,le,Se,W=0,We=[],S=y,$e=S.__b,Ce=S.__r,Ie=S.diffed,Pe=S.__c,Ee=S.unmount,Te=S.__;function xe(e,t){S.__h&&S.__h(k,e,W||t),W=0;var i=k.__H||(k.__H={__:[],__h:[]});return e>=i.__.length&&i.__.push({}),i.__[e]}function P(e){return W=1,pt(Ke,e)}function pt(e,t,i){var n=xe(Q++,2);if(n.t=e,!n.__c&&(n.__=[Ke(void 0,t),function(s){var c=n.__N?n.__N[0]:n.__[0],l=n.t(c,s);c!==l&&(n.__N=[l,n.__[1]],n.__c.setState({}))}],n.__c=k,!k.__f)){var r=function(s,c,l){if(!n.__c.__H)return!0;var _=n.__c.__H.__.filter(function(f){return f.__c});if(_.every(function(f){return!f.__N}))return!o||o.call(this,s,c,l);var u=n.__c.props!==s;return _.some(function(f){if(f.__N){var p=f.__[0];f.__=f.__N,f.__N=void 0,p!==f.__[0]&&(u=!0)}}),o&&o.call(this,s,c,l)||u};k.__f=!0;var o=k.shouldComponentUpdate,a=k.componentWillUpdate;k.componentWillUpdate=function(s,c,l){if(this.__e){var _=o;o=void 0,r(s,c,l),o=_}a&&a.call(this,s,c,l)},k.shouldComponentUpdate=r}return n.__N||n.__}function T(e,t){var i=xe(Q++,3);!S.__s&&Je(i.__H,t)&&(i.__=e,i.u=t,k.__H.__h.push(i))}function N(e){return W=5,Ze(function(){return{current:e}},[])}function Ze(e,t){var i=xe(Q++,7);return Je(i.__H,t)&&(i.__=e(),i.__H=t,i.__h=e),i.__}function O(e,t){return W=8,Ze(function(){return e},t)}function _t(){for(var e;e=We.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(te),t.__h.some(he),t.__h=[]}catch(i){t.__h=[],S.__e(i,e.__v)}}}S.__b=function(e){k=null,$e&&$e(e)},S.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),Te&&Te(e,t)},S.__r=function(e){Ce&&Ce(e),Q=0;var t=(k=e.__c).__H;t&&(le===k?(t.__h=[],k.__h=[],t.__.some(function(i){i.__N&&(i.__=i.__N),i.u=i.__N=void 0})):(t.__h.some(te),t.__h.some(he),t.__h=[],Q=0)),le=k},S.diffed=function(e){Ie&&Ie(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(We.push(t)!==1&&Se===S.requestAnimationFrame||((Se=S.requestAnimationFrame)||ft)(_t)),t.__H.__.some(function(i){i.u&&(i.__H=i.u),i.u=void 0})),le=k=null},S.__c=function(e,t){t.some(function(i){try{i.__h.some(te),i.__h=i.__h.filter(function(n){return!n.__||he(n)})}catch(n){t.some(function(r){r.__h&&(r.__h=[])}),t=[],S.__e(n,i.__v)}}),Pe&&Pe(e,t)},S.unmount=function(e){Ee&&Ee(e);var t,i=e.__c;i&&i.__H&&(i.__H.__.some(function(n){try{te(n)}catch(r){t=r}}),i.__H=void 0,t&&S.__e(t,i.__v))};var Fe=typeof requestAnimationFrame=="function";function ft(e){var t,i=function(){clearTimeout(n),Fe&&cancelAnimationFrame(t),setTimeout(e)},n=setTimeout(i,35);Fe&&(t=requestAnimationFrame(i))}function te(e){var t=k,i=e.__c;typeof i=="function"&&(e.__c=void 0,i()),k=t}function he(e){var t=k;e.__c=e.__(),k=t}function Je(e,t){return!e||e.length!==t.length||t.some(function(i,n){return i!==e[n]})}function Ke(e,t){return typeof t=="function"?t(e):t}function ht(e){const t=e.reduce((n,r)=>n+(r.trafficPct??0),0);if(t<=0)return e[0];let i=Math.random()*t;for(const n of e)if(i-=n.trafficPct??0,i<=0)return n;return e[e.length-1]}function mt(e,t){const i={};for(const r of Object.values(e.nodes)){if(r.kind!=="step"||!r.variantGroupId)continue;const o=r.variantGroupId;i[o]||(i[o]=[]),i[o].push(r)}const n={};for(const[r,o]of Object.entries(i)){const a=`quiz_${t}_vg_${r}`,s=localStorage.getItem(a);if(s&&e.nodes[s])n[r]=s;else{const c=ht(o);localStorage.setItem(a,c.id),n[r]=c.id}}return n}function gt(e,t){return Object.values(e.edges).filter(i=>i.from===t)}function bt(e,t,i){return!e||e.kind==="default"?!1:e.kind==="option"?e.optionId===t&&e.questionElId===i:!1}function M(e,t,i,n,r){const o=gt(e,t);if(o.length===0)return null;if(i!==null){const s=o.find(c=>bt(c.condition,i,n));if(s)return Ae(e,s.to,r)}const a=o.find(s=>!s.condition||s.condition.kind==="default")??o[0];return Ae(e,a.to,r)}function Ae(e,t,i){const n=e.nodes[t];if(!n)return null;if(n.kind!=="step")return n;if(n.variantGroupId){const r=i[n.variantGroupId];if(r)return e.nodes[r]??n}return n}function zt(e){return Object.values(e.nodes).find(t=>t.kind==="start")??null}function xt(){const e=new URLSearchParams(location.search),t={},i=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];for(const n of i){const r=e.get(n);r&&(t[n]=r)}return t}class qt{constructor(t,i){this.sessionId=t,this.flushFn=i,this.buf=[],this.flushTimer=null,this.flushTimer=setInterval(()=>void this.flush(),2e3),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&this.flush()})}push(t){this.buf.push({...t,ts:Date.now()})}async flush(){if(this.buf.length===0)return;const t=this.buf.splice(0);try{await this.flushFn(this.sessionId,t)}catch{this.buf.unshift(...t)}}destroy(){this.flushTimer&&clearInterval(this.flushTimer)}}async function vt(e,t,i,n,r){const o=await fetch(`${e}/api/quiz/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quizId:t,variant_assignments:i,utm:n,ua:navigator.userAgent,market:r})});if(!o.ok)throw new Error(`session start failed: ${o.status}`);return(await o.json()).session_id}async function yt(e,t,i){const n={session_id:t,events:i.map(o=>({event_type:o.event_type,step_id:o.step_id,variant_group_id:o.variant_group_id,option_id:o.option_id,meta:o.meta}))},r=await fetch(`${e}/api/quiz/events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n),keepalive:!0});if(!r.ok)throw new Error(`events flush failed: ${r.status}`)}async function wt(e,t,i,n){const r=await fetch(`${e}/api/quiz/klaviyo-subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:t,email:i,listId:n})});if(!r.ok)throw new Error(`klaviyo subscribe failed: ${r.status}`)}const kt={continue:{se:"Fortsätt",dk:"Fortsæt",no:"Fortsett",en:"Continue"},seeResults:{se:"Visa mitt resultat",dk:"Vis mit resultat",no:"Vis mitt resultat",en:"See my results"},emailPlaceholder:{se:"din@epost.se",dk:"din@email.dk",no:"din@e-post.no",en:"your@email.com"},invalidEmail:{se:"Ange en giltig e-postadress.",dk:"Indtast en gyldig e-mailadresse.",no:"Oppgi en gyldig e-postadresse.",en:"Please enter a valid email address."},loadingResults:{se:"Laddar ditt resultat...",dk:"Indlæser dit resultat...",no:"Laster resultatet ditt...",en:"Loading your results..."},searchPlaceholder:{se:"Sök...",dk:"Søg...",no:"Søk...",en:"Search..."},selectPlaceholder:{se:"Välj ett alternativ",dk:"Vælg en mulighed",no:"Velg et alternativ",en:"Select an option"},noMatches:{se:"Inga träffar",dk:"Ingen resultater",no:"Ingen treff",en:"No matches"}};function A(e,t){const i=t??"en",n=kt[e];return i in n?n[i]:n.en}function Xe(e){if(!e)return;const t=i=>{i.removeAttribute("class");const n=i.getAttribute("style");if(n){const r=n.split(";").map(o=>o.trim()).filter(o=>/^color\s*:/i.test(o)).join("; ");r?i.setAttribute("style",r):i.removeAttribute("style")}for(const r of Array.from(i.children))t(r)};for(const i of Array.from(e.children))t(i)}function de(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function St(e){if(!e)return e;const t=e.slice(-1).toLowerCase();return t==="s"||t==="x"||t==="z"?e:e+"s"}const Le={name:"Din valp",breed:"din valp",primary_pain:"beteendeproblem",upcoming_event_value:"",time_per_day:"10 min/dag"};function Ne(e,t){if(t!=null&&t.trim()!=="")return t;if(e in Le)return Le[e]}function Z(e,t){return e.includes("{")?e.replace(/\{([a-zA-Z_][\w]*)\}/g,(i,n)=>{if(n.endsWith("_pos")){const a=n.slice(0,-4),s=t?.[a],c=Ne(a,s);return c==null?i:de(c==="Din valp"?"Din valps":St(c))}const r=t?.[n],o=Ne(n,r);return o==null?i:de(o)}):e}function $t({el:e,variables:t}){const i=N(null),n=Z(e.text,t);return T(()=>{i.current&&(i.current.innerHTML=n,Xe(i.current))},[n]),d("h1",{ref:i,"data-quiz-el":"title","data-quiz-el-id":e.id,class:"quiz-title"})}function Ct({el:e,variables:t}){const i=N(null),n=Z(e.text,t);return T(()=>{i.current&&(i.current.innerHTML=n,Xe(i.current))},[n]),d("div",{ref:i,"data-quiz-el":"text","data-quiz-el-id":e.id,class:"quiz-text"})}function It({el:e}){return d("img",{"data-quiz-el":"image","data-quiz-el-id":e.id,src:e.url,alt:e.alt,class:"quiz-image"})}function Pt({el:e,variables:t,onVariableChange:i}){const[n,r]=P(t?.[e.variable]??"");T(()=>{i?.(e.variable,n)},[n,e.variable,i]);const o=e.inputType==="number"?"number":e.inputType==="date"?"date":"text";return d("input",{type:o,class:"quiz-text-input","data-quiz-el":"text_input","data-quiz-el-id":e.id,placeholder:e.placeholder,value:n,min:e.min,max:e.max,onInput:a=>r(a.target.value)})}function Et({el:e,variables:t,onVariableChange:i}){const[n,r]=P(Number(t?.[e.variable]??e.initial??Math.round((e.min+e.max)/2)));T(()=>{i?.(e.variable,String(n))},[n,e.variable,i]);const o=e.unit??"",a=(n-e.min)/(e.max-e.min)*100;return d("div",{class:"quiz-range","data-quiz-el":"range_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-range-value",children:[n,o&&` ${o}`]}),d("input",{type:"range",class:"quiz-range-input",min:e.min,max:e.max,step:e.step??1,value:n,style:`--quiz-range-pct: ${a}%`,onInput:s=>r(Number(s.target.value))}),d("div",{class:"quiz-range-bounds",children:[d("span",{children:[e.min,o&&` ${o}`]}),d("span",{children:[e.max,o&&` ${o}`]})]})]})}function Tt({el:e}){const[t,i]=P(0),n=e.items.length;if(n===0)return null;const r=e.items[t],o=()=>i(s=>(s+1)%n),a=()=>i(s=>(s-1+n)%n);return d("div",{class:"quiz-testimonial-slider","data-quiz-el":"testimonial_slider","data-quiz-el-id":e.id,children:[d("div",{class:"quiz-testimonial-card",children:[r.avatar&&d("img",{src:r.avatar,alt:r.name,class:"quiz-testimonial-avatar"}),d("div",{class:"quiz-testimonial-body",children:[d("div",{class:"quiz-testimonial-name",children:r.name}),typeof r.rating=="number"&&d("div",{class:"quiz-testimonial-rating","aria-label":`${r.rating} stars`,children:["★".repeat(Math.round(r.rating)),d("span",{class:"quiz-testimonial-rating-empty",children:"★".repeat(Math.max(0,5-Math.round(r.rating)))})]}),d("div",{class:"quiz-testimonial-text",children:r.text})]})]}),n>1&&d("div",{class:"quiz-testimonial-nav",children:[d("button",{type:"button",class:"quiz-testimonial-prev",onClick:a,"aria-label":"Previous",children:"←"}),d("span",{class:"quiz-testimonial-dots",children:Array.from({length:n},(s,c)=>d("button",{type:"button",class:`quiz-testimonial-dot${c===t?" quiz-testimonial-dot--active":""}`,onClick:()=>i(c),"aria-label":`Go to testimonial ${c+1}`},c))}),d("button",{type:"button",class:"quiz-testimonial-next",onClick:o,"aria-label":"Next",children:"→"})]})]})}function Ft(e){let t="",i="'Quicksand', system-ui, -apple-system, sans-serif",n="#1A1A1A",r="transparent";if(typeof window<"u"&&typeof document<"u"){const o=getComputedStyle(document.documentElement),a=(c,l)=>o.getPropertyValue(c).trim()||l;i=a("--quiz-font",i),n=a("--quiz-text-primary",n),r=a("--quiz-bg",r),t=["--quiz-bg","--quiz-text-primary","--quiz-text-secondary","--quiz-brand","--quiz-option-bg","--quiz-option-border","--quiz-option-selected-bg","--quiz-option-radius","--quiz-option-padding","--quiz-option-border-width","--quiz-cta-radius","--quiz-cta-padding","--quiz-step-gap","--quiz-font"].map(c=>`  ${c}: ${a(c,"").trim()||"initial"};`).join(`
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
</html>`}function At(e){return e?!!(e.length>1500||/<style[\s>]/i.test(e)||/<svg[\s>]/i.test(e)||/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(e)||/<link[^>]+rel=["']stylesheet/i.test(e)):!1}function Lt(e){const t=["svg",'[data-blocktype="photo-carousel"]',"input","script","style"];for(const i of t)for(const n of Array.from(e.querySelectorAll(i)))n.parentNode?.removeChild(n);e.innerText.trim().length===0&&(e.style.display="none")}function Nt({el:e,variables:t}){const i=N(null),n=N(null),r=Z(e.html,t),o=At(r);if(T(()=>{o||!i.current||(i.current.innerHTML=r,Lt(i.current))},[r,o]),T(()=>{if(!o||!n.current)return;const a=n.current;let s=null,c=0;const l=()=>{try{const u=a.contentDocument;if(!u)return;const f=u.documentElement?.scrollHeight??0;f>0&&(a.style.height=f+"px")}catch{}},_=()=>{l(),c=requestAnimationFrame(l);try{const u=a.contentDocument;u&&typeof ResizeObserver<"u"&&(s=new ResizeObserver(l),s.observe(u.documentElement))}catch{}};return a.addEventListener("load",_),_(),()=>{a.removeEventListener("load",_),s?.disconnect(),c&&cancelAnimationFrame(c)}},[r,o]),o){const a=Ft(r);return d("iframe",{ref:n,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html-frame",sandbox:"allow-scripts allow-same-origin",srcdoc:a,title:`Custom block ${e.id}`})}return d("div",{ref:i,"data-quiz-el":"custom_html","data-quiz-el-id":e.id,class:"quiz-custom-html"})}function jt({el:e,onComplete:t,variables:i}){T(()=>{const r=setTimeout(t,e.seconds*1e3);return()=>clearTimeout(r)},[e.seconds,t]);const n=Z(e.text??"",i);return d("div",{"data-quiz-el":"loading","data-quiz-el-id":e.id,class:"quiz-loading",children:[d("div",{class:"quiz-loading-spinner"}),n&&d("p",{class:"quiz-loading-text",children:n})]})}function Ot({option:e,layout:t,selected:i,onClick:n,variables:r,kindOf:o}){const a=["quiz-option",`quiz-option--${t}`,o==="multi"?"quiz-option--multi":"",i?"quiz-option--selected":""].filter(Boolean).join(" "),s=Z(e.label,r),c=o==="multi"&&(t==="list"||t==="cards"),l=o==="single"&&(t==="list"||t==="cards");return d("button",{class:a,"data-quiz-opt-id":e.id,onClick:n,type:"button",children:[t==="image_cards"&&e.imageUrl&&d("img",{src:e.imageUrl,alt:s,class:"quiz-option-img"}),t==="image_cards"&&!e.imageUrl&&e.imageDescription&&d("span",{class:"quiz-option-img-placeholder",title:e.imageDescription,children:d("span",{class:"quiz-option-img-placeholder-label",children:e.imageDescription})}),e.emoji&&d("span",{class:"quiz-option-emoji",children:e.emoji}),d("span",{class:"quiz-option-label",children:s}),l&&d("span",{class:"quiz-option-arrow","aria-hidden":"true",children:d("svg",{viewBox:"0 0 20 20",width:"16",height:"16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M7 5L13 10L7 15",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"})})}),c&&d("span",{class:`quiz-option-checkbox${i?" quiz-option-checkbox--checked":""}`,"aria-hidden":"true",children:i&&d("svg",{viewBox:"0 0 20 20",width:"14",height:"14",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:d("path",{d:"M4 10.5L8 14.5L16 6.5",stroke:"#FFFFFF","stroke-width":"2.5","stroke-linecap":"round","stroke-linejoin":"round"})})})]})}function Ut({el:e,onAnswer:t,market:i,variables:n}){const[r,o]=P(new Set),a=c=>{e.kindOf==="single"?(o(new Set([c])),e.layout!=="dropdown"&&setTimeout(()=>t(e.id,c),200)):o(l=>{const _=new Set(l);return _.has(c)?_.delete(c):_.add(c),_})};if(e.layout==="dropdown")return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:"quiz-question quiz-question--dropdown",children:[d(Ht,{el:e,selected:r,onPick:c=>a(c),market:i}),r.size>0&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",onClick:()=>t(e.id,[...r][0]),children:[A("continue",i),e.kindOf==="multi"?` (${r.size})`:""]}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]});const s=e.escapeOption?e.options.filter(c=>c.id!==e.escapeOption.optionId):e.options;return d("div",{"data-quiz-el":"question","data-quiz-el-id":e.id,class:`quiz-question quiz-question--${e.layout}`,children:[s.map(c=>d(Ot,{option:c,layout:e.layout,selected:r.has(c.id),onClick:()=>a(c.id),variables:n,kindOf:e.kindOf},c.id)),(e.kindOf==="multi"||e.kindOf==="single"&&e.escapeOption)&&d("div",{class:"quiz-question-bottom",children:[e.kindOf==="multi"&&d("button",{class:"quiz-btn quiz-btn--primary quiz-question-continue",type:"button",disabled:r.size===0,onClick:()=>{if(r.size===0)return;const c=[...r][0];t(e.id,c)},children:A("continue",i)}),e.escapeOption&&d("button",{class:"quiz-escape-link",type:"button",onClick:()=>t(e.id,e.escapeOption.optionId),children:e.escapeOption.label})]})]})}function Ht({el:e,selected:t,onPick:i,market:n}){const r=e.kindOf==="multi",o=e.options.filter(b=>t.has(b.id)),a=o.length>0,s=!r&&a?o[0].label:"",[c,l]=P(s),[_,u]=P(!1),f=N(null),p=N(null);T(()=>{const b=C=>{f.current&&!f.current.contains(C.target)&&u(!1)};return document.addEventListener("mousedown",b),()=>document.removeEventListener("mousedown",b)},[]);const q=c.trim().toLowerCase(),h=!r&&a&&o[0].label.toLowerCase()===q,w=q?e.options.filter(b=>b.label.toLowerCase().includes(q)):e.options,g=_&&!h,x=e.dropdownPlaceholder||(e.searchable?A("searchPlaceholder",n):A("selectPlaceholder",n));return d("div",{class:`quiz-dropdown${_?" quiz-dropdown--open":""}${r?" quiz-dropdown--multi":""}`,ref:f,children:[r&&a&&d("div",{class:"quiz-dropdown-chips quiz-dropdown-chips--stack",children:[o.slice(0,4).map(b=>d("span",{class:"quiz-dropdown-chip",children:b.label},b.id)),o.length>4&&d("span",{class:"quiz-dropdown-chip quiz-dropdown-chip--more",children:["+",o.length-4]})]}),d("input",{ref:p,type:"text",class:"quiz-dropdown-input",placeholder:x,value:c,autoComplete:"off",autoCapitalize:"words",spellcheck:!1,onFocus:()=>u(!0),onInput:b=>{l(b.target.value),u(!0)}}),g&&d("ul",{class:"quiz-dropdown-list",children:[w.length===0&&d("li",{class:"quiz-dropdown-empty",children:A("noMatches",n)}),w.slice(0,50).map(b=>{const C=t.has(b.id);return d("li",{children:d("button",{type:"button",class:`quiz-dropdown-item${C?" quiz-dropdown-item--selected":""}`,"data-quiz-opt-id":b.id,onMouseDown:$=>{$.preventDefault()},onClick:()=>{i(b.id),r?(l(""),p.current?.focus()):(l(b.label),u(!1),p.current?.blur())},children:[r&&d("span",{class:`quiz-dropdown-check${C?" quiz-dropdown-check--on":""}`,"aria-hidden":"true",children:C?"✓":""}),b.emoji&&d("span",{class:"quiz-dropdown-emoji",children:b.emoji}),b.label]})},b.id)})]})]})}function Mt({onSubmit:e,market:t}){const[i,n]=P(""),[r,o]=P("");return d("form",{class:"quiz-email-form",onSubmit:s=>{if(s.preventDefault(),!i.includes("@")){o(A("invalidEmail",t));return}o(""),e(i)},novalidate:!0,children:[d("input",{type:"email",class:"quiz-email-input",placeholder:A("emailPlaceholder",t),value:i,onInput:s=>n(s.target.value),required:!0}),r&&d("p",{class:"quiz-email-error",children:r}),d("button",{type:"submit",class:"quiz-btn quiz-btn--primary quiz-email-submit",children:A("continue",t)})]})}function Dt({node:e,onAnswer:t,onLoadingComplete:i,onEmailSubmit:n,captureAtStepId:r,market:o,onContinue:a,variables:s,onVariableChange:c}){const l=e.subEls.some(h=>h.kind==="question"),_=e.subEls.some(h=>h.kind==="loading"),u=!!e.name&&/^commit/i.test(e.name),f=!l&&!_&&!u&&typeof a=="function",p=e.subEls.filter(h=>h.kind==="text_input"),q=f&&p.length>0&&p.some(h=>{const w=s?.[h.variable];return w==null||w.trim().length===0});return d("div",{class:"quiz-step","data-step-id":e.id,children:[e.subEls.map(h=>{switch(h.kind){case"title":return d($t,{el:h,variables:s},h.id);case"text":return d(Ct,{el:h,variables:s},h.id);case"image":return d(It,{el:h},h.id);case"custom_html":return d(Nt,{el:h,variables:s},h.id);case"loading":return d(jt,{el:h,onComplete:i,variables:s},h.id);case"question":return d(Ut,{el:h,onAnswer:t,market:o,variables:s},h.id);case"text_input":return d(Pt,{el:h,variables:s,onVariableChange:c},h.id);case"range_slider":return d(Et,{el:h,variables:s,onVariableChange:c},h.id);case"testimonial_slider":return d(Tt,{el:h},h.id)}}),r===e.id&&d(Mt,{onSubmit:n,market:o}),f&&d("div",{class:"quiz-continue-wrap",children:d("button",{class:"quiz-btn quiz-btn--primary",type:"button",onClick:a,disabled:q,children:A("continue",o)})})]})}function Bt({current:e,total:t}){const i=t>0?Math.round(e/t*100):0;return d("div",{class:"quiz-progress",role:"progressbar","aria-valuenow":i,"aria-valuemax":100,children:d("div",{class:"quiz-progress-bar",style:{width:`${i}%`}})})}function Rt(e){const{brandColors:t,fontSettings:i}=e,n=i.enabled&&i.fontFamily?i.fontFamily:"Inter, system-ui, sans-serif";if(i.enabled&&i.fontFamily&&i.fontFamily!=="Inter"){const a=document.createElement("link");a.rel="stylesheet",a.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.fontFamily)}:wght@400;500;600;700&display=swap`,document.head.appendChild(a)}const r=e.design??{},o=document.createElement("style");o.textContent=`
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
  padding: 0;
  overflow: hidden;
  min-height: 0;
}
.quiz-option--image_cards .quiz-option-label { padding: 10px 8px 12px; font-size: 15px; font-weight: 500; }

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
.quiz-option--image_cards .quiz-option-img-placeholder { border-radius: 10px 10px 0 0; border: 2px dashed rgba(255,255,255,0.25); color: rgba(255,255,255,0.55); }
.quiz-option-img-placeholder-label {
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
  font-style: italic;
}
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
.quiz-content { padding-bottom: 160px; }
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

.quiz-continue-wrap { margin-top: 16px; }

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
  .quiz-content { padding: 20px 10px 48px; }
}
  `,document.head.appendChild(o)}function Gt(e){const t=Object.values(e.nodes).filter(s=>s.kind==="step"),i=new Set(t.map(s=>s.id)),n=Object.values(e.nodes).find(s=>s.kind==="start"),r=[];if(n)for(const s of Object.values(e.edges))s.from===n.id&&i.has(s.to)&&r.push(s.to);else for(const s of t)r.push(s.id);const o=new Set,a=[];for(;r.length;){const s=r.shift();if(o.has(s))continue;o.add(s);const c=e.nodes[s];c&&c.kind==="step"&&a.push(c);for(const l of Object.values(e.edges))l.from===s&&i.has(l.to)&&!o.has(l.to)&&r.push(l.to)}for(const s of t)o.has(s.id)||a.push(s);return a}function Vt({node:e,onTrigger:t}){const i=N(!1);return T(()=>{i.current||(i.current=!0,t(e))},[e,t]),null}function ce(e,t){typeof window.fbq=="function"&&window.fbq("track",e,t)}function Qt({data:e,settings:t,config:i}){const[n,r]=P(null),[o,a]=P([]),[s,c]=P(null),[l,_]=P({}),[u,f]=P(0),[p,q]=P(null),[h,w]=P({}),g=N(null),x=N(!1);T(()=>{if(!p)return;const m=setTimeout(()=>q(null),4e3);return()=>clearTimeout(m)},[p]);const b=Gt(e),C=b.length;T(()=>{if(x.current)return;x.current=!0;const m=mt(e,i.quizId);_(m);const v=zt(e);if(!v){console.error("[quiz-runtime] No start node found");return}const z=M(e,v.id,null,null,m);if(r(z),!i.preview&&t.providers.metaPixel?.pixelId&&ce("PageView",{}),i.preview)return;const E=xt();vt(i.apiBaseUrl,i.quizId,m,E,e.id??"").then(I=>{c(I),g.current=new qt(I,(H,G)=>yt(i.apiBaseUrl,H,G)),z&&z.kind==="step"&&g.current.push({event_type:"step_view",step_id:z.id,variant_group_id:z.variantGroupId})}).catch(I=>{console.warn("[quiz-runtime] session start failed:",I)})},[]),T(()=>()=>g.current?.destroy(),[]),T(()=>{const m=v=>{const z=v.data;if(!z||typeof z!="object"||z.type!=="quiz-runtime-continue"||!n||n.kind!=="step")return;i.preview||g.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:typeof z.value=="string"?z.value:"yes",meta:{source:"commit_gate_modal"}});const E=M(e,n.id,null,null,l);E&&$(E)};return window.addEventListener("message",m),()=>window.removeEventListener("message",m)},[n,e,l,i.preview]),T(()=>{if(!n||n.kind!=="step")return;const m=n;if(m.subEls.length===0){const v=M(e,m.id,null,null,l);v&&v.id!==n.id&&$(v,!1)}},[n]);const $=O((m,v=!0)=>{if(v&&n&&a(z=>[...z,n]),r(m),m.kind==="step"){const z=b.findIndex(E=>E.id===m.id);z>=0&&f(z),i.preview||g.current?.push({event_type:"step_view",step_id:m.id,variant_group_id:m.variantGroupId})}},[n,b,i.preview]),J=O((m,v)=>{if(!n||n.kind!=="step")return;const z=n.subEls.find(I=>I.id===m&&I.kind==="question");if(z&&z.kind==="question"&&z.variable){const I=z.options.find(H=>H.id===v);I&&w(H=>({...H,[z.variable]:I.label,...I.value!==void 0?{[`${z.variable}_value`]:I.value}:{}}))}i.preview||g.current?.push({event_type:"answer",step_id:n.id,variant_group_id:n.variantGroupId,option_id:v,meta:{questionElId:m}});const E=M(e,n.id,v,m,l);E&&$(E)},[n,e,l,$]),D=O((m,v)=>{w(z=>({...z,[m]:v}))},[]),R=O(()=>{if(!n||n.kind!=="step")return;const m=M(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),F=O(()=>{if(!n||n.kind!=="step")return;const m=M(e,n.id,null,null,l);m&&$(m)},[n,e,l,$]),j=O(async m=>{if(!i.preview&&(g.current?.push({event_type:"email_capture",step_id:n?.kind==="step"?n.id:void 0,meta:{email:m}}),t.providers.metaPixel?.pixelId&&ce("Lead",{content_name:t.metadata.title,value:0}),t.providers.klaviyo?.listId&&s))try{await wt(i.apiBaseUrl,s,m,t.providers.klaviyo.listId)}catch(v){console.warn("[quiz-runtime] Klaviyo subscribe failed:",v)}if(n&&n.kind==="step"){const v=M(e,n.id,null,null,l);v&&$(v)}},[n,e,l,$,s,t,i]),Ye=O(()=>{i.preview||g.current?.push({event_type:"back",step_id:n?.kind==="step"?n.id:void 0}),a(m=>{if(m.length===0)return m;const v=m[m.length-1],z=m.slice(0,-1);if(r(v),v.kind==="step"){const E=b.findIndex(I=>I.id===v.id);E>=0&&f(E)}return z})},[n,b]),et=O(m=>{if(i.preview){const G=m.redirectUrl||t.redirectUrl||"(no redirect URL)";q(`[Preview] Would redirect to: ${G}`);return}g.current?.push({event_type:"exit_click"}),t.providers.metaPixel?.pixelId&&ce("CompleteRegistration",{content_name:t.metadata.title,value:0});const v=m.redirectUrl||t.redirectUrl||"",z=new URL(v,location.href);z.searchParams.set("utm_source","quiz"),z.searchParams.set("utm_campaign",document.title||"quiz"),s&&z.searchParams.set("utm_content",s);const E=z.toString(),I=g.current?.flush().catch(()=>{})??Promise.resolve(),H=new Promise(G=>setTimeout(G,1500));Promise.race([I,H]).finally(()=>{location.href=E})},[t,s,i.preview]);if(n?.kind==="exit")return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-content quiz-exit",children:[d(Vt,{node:n,onTrigger:et}),d("div",{class:"quiz-loading-spinner"}),d("p",{class:"quiz-text",children:A("loadingResults",i.market)})]}),p&&d("div",{class:"quiz-preview-toast",children:p})]});if(!n||n.kind!=="step")return d("div",{class:"quiz-shell",children:d("div",{class:"quiz-content",children:d("div",{class:"quiz-loading",children:d("div",{class:"quiz-loading-spinner"})})})});const qe=n,tt=t.backNavigation&&o.length>0,it=t.providers.klaviyo?.captureAtStepId;return d("div",{class:"quiz-shell",children:[d("div",{class:"quiz-header",children:[d("div",{class:"quiz-header-side quiz-header-side--start",children:tt&&d("button",{class:"quiz-back-btn",type:"button",onClick:Ye,"aria-label":"Go back",children:"←"})}),t.brandLogo?.enabled&&t.brandLogo.url&&d("img",{src:t.brandLogo.url,alt:"Logo",class:"quiz-logo"}),d("div",{class:"quiz-header-side quiz-header-side--end",children:t.stepProgressCount&&d("span",{class:"quiz-step-count",children:[u+1," / ",C]})})]}),t.progressBar&&d(Bt,{current:u+1,total:C}),d("div",{class:"quiz-content",children:d(Dt,{node:qe,onAnswer:J,onLoadingComplete:R,onEmailSubmit:j,captureAtStepId:it,market:i.market,onContinue:F,variables:h,onVariableChange:D},qe.id)})]})}function je(){const e=window.__QUIZ_DATA__,t=window.__QUIZ_SETTINGS__,i=window.__QUIZ_CONFIG__;if(!e||!t||!i){console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");return}Rt(t);const n=document.getElementById("quiz-root");if(!n){console.error("[quiz-runtime] #quiz-root element not found");return}dt(d(Qt,{data:e,settings:t,config:i}),n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",je):je();
