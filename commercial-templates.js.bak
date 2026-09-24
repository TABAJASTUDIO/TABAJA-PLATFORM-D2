(() => {
  const COLLECTIONS = {
    government: {
      title: 'Government', eyebrow: 'OFFICIAL DOCUMENTS', description: 'Choose the government credential you want to prepare.',
      types: [
        ['government','♜','Government ID','Official staff and civil-service identity','Ready'],
        ['driver','▤','Driver Licence','Front-and-back road credential layouts','Ready'],
        ['residence','⌂','Residence Permit','Resident and immigration identity cards','Ready'],
        ['national','▣','National ID','Citizen identity card library','Planned'],
        ['police','◆','Police ID','Law-enforcement credentials','Planned'],
        ['immigration','↗','Immigration','Border and immigration staff cards','Planned'],
        ['customs','▥','Customs','Customs and port authority cards','Planned'],
        ['visitor','＋','Government Visitor','Temporary official visitor passes','Planned']
      ]
    },
    corporate: {title:'Corporate',eyebrow:'BUSINESS IDENTITY',description:'Executive, employee and contractor card designs.',types:[['corporate','▥','Corporate IDs','Executive and employee identities','Ready'],['visitor','＋','Visitor Cards','Temporary guest access','Planned'],['contractor','▣','Contractor Cards','External workforce identities','Planned'],['executive','★','Executive Cards','Premium leadership designs','Planned']]},
    healthcare: {title:'Healthcare',eyebrow:'MEDICAL IDENTITY',description:'Medical professionals, facilities and patient-facing credentials.',types:[['healthcare','✚','Doctor ID','Professional medical staff cards','Ready'],['nurse','＋','Nurse ID','Nursing teams and wards','Planned'],['laboratory','◇','Laboratory','Lab technicians and access','Planned'],['pharmacy','▤','Pharmacy','Pharmacist and dispensary cards','Planned']]},
    security: {title:'Security',eyebrow:'ACCESS CONTROL',description:'Security personnel and restricted-access credentials.',types:[['security','◆','Security IDs','Guards and supervisors','Ready'],['visitor','＋','Visitor Pass','Temporary access cards','Planned'],['access','▣','Access Level','Colour-coded permission cards','Planned'],['contractor','▥','Contractor Access','External security clearance','Planned']]},
    membership: {title:'Membership',eyebrow:'LOYALTY & VIP',description:'Member, club, loyalty and premium access cards.',types:[['membership','★','Membership Cards','VIP and club identities','Ready'],['loyalty','◇','Loyalty Cards','Retail rewards and points','Planned'],['event','▣','Event Access','Conferences and venues','Planned'],['premium','♢','Premium Members','Luxury member editions','Planned']]},
    education: {title:'Education',eyebrow:'SCHOOLS & CAMPUSES',description:'Structured space for student and campus card collections.',types:[['student','▰','Student ID','School and university identity','Planned'],['teacher','▥','Teacher ID','Faculty and staff credentials','Planned'],['library','▤','Library Card','Borrowing and facility access','Planned'],['campus','◇','Campus Access','Buildings and residential access','Planned']]}
  };
  function go(view){ document.querySelector(`.v8-nav-btn[data-view="${view}"]`)?.click(); }
  function init(){
    const grid=document.getElementById('templateGrid');
    const search=document.getElementById('templateSearch');
    const filters=[...document.querySelectorAll('[data-template-filter]')];
    const cards=[...document.querySelectorAll('.tg-card')];
    const home=document.getElementById('collectionHome');
    const detail=document.getElementById('collectionDetail');
    const browser=document.getElementById('templateBrowser');
    const typeGrid=document.getElementById('collectionTypeGrid');
    cards.forEach(card=>{
      if(card.querySelector('.tg-card-badges')) return;
      const tags=(card.dataset.templateTags||'').toLowerCase();
      const badges=document.createElement('div'); badges.className='tg-card-badges';
      const material=tags.includes('black')?'BLACK PVC':'WHITE PVC';
      const premium=/(luxury|premium|gold|silver|executive)/.test(tags);
      badges.innerHTML=`<span>${material}</span>${premium?'<span class="premium">PREMIUM</span>':''}`;
      card.querySelector('.tg-preview')?.appendChild(badges);
    });
    const count=document.getElementById('templateResultCount'); const empty=document.getElementById('templateEmpty');
    let filter='all';
    const refresh=()=>{const q=(search?.value||'').trim().toLowerCase();let visible=0;cards.forEach(card=>{const hay=`${card.dataset.templateTags} ${card.textContent}`.toLowerCase();const show=(filter==='all'||hay.includes(filter))&&(!q||hay.includes(q));card.hidden=!show;if(show)visible++;});if(count)count.textContent=`${visible} ready design${visible===1?'':'s'}`;if(empty)empty.hidden=visible!==0;};
    const openBrowser=(wanted='all')=>{home.hidden=true;detail.hidden=true;browser.hidden=false;browser.classList.add('is-open');const match=filters.find(x=>x.dataset.templateFilter===wanted)||filters[0];match?.click();browser.scrollIntoView({behavior:'smooth',block:'start'});};
    const showHome=()=>{home.hidden=false;detail.hidden=true;browser.hidden=true;browser.classList.remove('is-open');};
    const openCollection=(key)=>{const c=COLLECTIONS[key];if(!c)return;home.hidden=true;browser.hidden=true;detail.hidden=false;document.getElementById('collectionEyebrow').textContent=c.eyebrow;document.getElementById('collectionTitle').textContent=c.title;document.getElementById('collectionDescription').textContent=c.description;const ready=c.types.filter(x=>x[4]==='Ready').length;document.getElementById('collectionReadyCount').textContent=`${ready} ready card type${ready===1?'':'s'}`;typeGrid.innerHTML=c.types.map(([filterKey,icon,title,desc,status])=>`<button class="collection-type-card ${status==='Ready'?'is-ready':'is-planned'}" type="button" data-type-filter="${filterKey}" data-status="${status}"><i>${icon}</i><b>${title}</b><small>${desc}</small><em>${status==='Ready'?'READY':'COMING SOON'}</em></button>`).join('');detail.scrollIntoView({behavior:'smooth',block:'start'});};
    filters.forEach(btn=>btn.addEventListener('click',()=>{filters.forEach(x=>x.classList.remove('active'));btn.classList.add('active');filter=btn.dataset.templateFilter;refresh();}));
    search?.addEventListener('input',refresh);
    document.querySelectorAll('[data-open-collection]').forEach(btn=>btn.addEventListener('click',()=>openCollection(btn.dataset.openCollection)));
    document.getElementById('showAllTemplates')?.addEventListener('click',()=>openBrowser('all'));
    document.getElementById('backToCollections')?.addEventListener('click',showHome);
    typeGrid?.addEventListener('click',e=>{const btn=e.target.closest('[data-type-filter]');if(!btn)return;if(btn.dataset.status==='Ready'){const title=btn.querySelector('b')?.textContent||'Templates';openBrowser(btn.dataset.typeFilter);const heading=document.querySelector('#templateBrowser .tg-section-head h3');if(heading)heading.textContent=`${title} Templates`;}else{const toast=document.getElementById('appToast');if(toast){toast.innerHTML=`<b>${btn.querySelector('b')?.textContent||'This card type'}</b><br>This collection is being prepared and will be available in a future update.`;toast.classList.add('show');clearTimeout(window.__tabajaToast);window.__tabajaToast=setTimeout(()=>toast.classList.remove('show'),3200);}}});
    const back=document.createElement('button');back.type='button';back.className='template-browser-back';back.textContent='← Back to collections';back.addEventListener('click',showHome);browser?.prepend(back);
    grid?.addEventListener('click',event=>{const card=event.target.closest('.tg-card');if(!card)return;if(window.TabajaCommercialTemplates?.apply(card.dataset.templateId)){go('designer');}});
    document.getElementById('openBlankDesigner')?.addEventListener('click',()=>go('designer'));
    const elements=document.getElementById('elementsLibrary');
    document.querySelector('[data-quick-go="collections"]')?.addEventListener('click',()=>document.getElementById('collectionHome')?.scrollIntoView({behavior:'smooth'}));
    document.querySelector('[data-quick-go="templates"]')?.addEventListener('click',()=>openBrowser('all'));
    document.querySelector('[data-quick-go="elements"]')?.addEventListener('click',()=>{elements.hidden=false;elements.scrollIntoView({behavior:'smooth',block:'start'});});
    document.getElementById('closeElementsLibrary')?.addEventListener('click',()=>{elements.hidden=true;document.getElementById('collectionHome')?.scrollIntoView({behavior:'smooth'});});
    document.getElementById('openElementsBtn')?.addEventListener('click',()=>{go('templates');setTimeout(()=>{elements.hidden=false;elements.scrollIntoView({behavior:'smooth',block:'start'});},100);});
    document.querySelectorAll('[data-card-symbol]').forEach(btn=>btn.addEventListener('click',()=>{
      const symbol=btn.dataset.cardSymbol;
      if(window.TabajaElements?.addSymbol(symbol)){go('designer');}
    }));
    const globalSearch=document.getElementById('globalTemplateSearch');
    globalSearch?.addEventListener('focus',()=>go('templates'));
    globalSearch?.addEventListener('input',()=>{if(search){search.value=globalSearch.value;openBrowser('all');refresh();}});
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch?.focus();}});
    document.querySelectorAll('[data-bg-type]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-bg-type]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('[data-bg-panel]').forEach(x=>x.classList.toggle('active',x.dataset.bgPanel===btn.dataset.bgType));}));
    document.getElementById('useSplitGradientBtn')?.addEventListener('click',()=>document.querySelector('[data-bg-type="gradient"]')?.click());
    refresh();showHome();
  }
  window.addEventListener('DOMContentLoaded',init);
})();
