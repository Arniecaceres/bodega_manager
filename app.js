/****************************
 * Utilidades
 ****************************/
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmtMoney = n => `S/ ${Number(n||0).toFixed(2)}`;
const todayISO = () => new Date().toISOString().slice(0,10);
const toISO = d => new Date(d).toISOString().slice(0,10);
const prettyDate = d => {
  if(!d) return '—';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};
const ymd = (date)=> {
  const d = new Date(date);
  return { y: d.getFullYear(), m: d.getMonth()+1, d: d.getDate() };
};
const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};
const yearKey = (date) => String(new Date(date).getFullYear());
const uid = () => Math.random().toString(36).slice(2,9);

/****************************
 * Simulación de base de datos por usuario (localStorage)
 ****************************/
const STORAGE = {
  key: (user, name) => `bodega:${user}:${name}`,
  get(user, name, def){
    try{ return JSON.parse(localStorage.getItem(this.key(user,name))) ?? def }catch{ return def }
  },
  set(user, name, val){ localStorage.setItem(this.key(user,name), JSON.stringify(val)); },
  remove(user, name){ localStorage.removeItem(this.key(user,name)); }
};

/****************************
 * Gestión de usuarios
 ****************************/
const USERS_KEY = 'bodega:__users__';
const Users = {
  all(){ try{ return JSON.parse(localStorage.getItem(USERS_KEY))||{admin:'admin123'} }catch{ return {admin:'admin123'} }},
  save(obj){ localStorage.setItem(USERS_KEY, JSON.stringify(obj)); },
  create(u,p){ const all=this.all(); if(all[u]) return false; all[u]=p; this.save(all); return true; },
  remove(u){ const all=this.all(); delete all[u]; this.save(all); }
};

/****************************
 * Estado global de sesión
 ****************************/
const Session = {
  get user(){ return sessionStorage.getItem('bodega:user') },
  set user(v){ sessionStorage.setItem('bodega:user', v) }
};

/****************************
 * Modelos por usuario
 ****************************/
const DB = {
  products(){ return STORAGE.get(Session.user, 'products', []) },
  saveProducts(list){ STORAGE.set(Session.user, 'products', list) },
  sales(){ return STORAGE.get(Session.user, 'sales', []) },
  saveSales(list){ STORAGE.set(Session.user, 'sales', list) },
};

/****************************
 * LOGIN
 ****************************/
function attemptLogin(){
  const u = $('#loginUser').value.trim();
  const p = $('#loginPass').value;
  const users = Users.all();
  if(!users[u] || users[u] !== p){
    $('#loginMsg').textContent = 'Usuario o contraseña inválidos';
    return;
  }
  Session.user = u;
  $('#loginMsg').textContent = '';
  initApp();
}

$('#btnLogin').addEventListener('click', attemptLogin);
$('#loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });

/****************************
 * App Init / Logout
 ****************************/
function initApp(){
  if(!Session.user){
    $('#loginView').classList.remove('hidden');
    $('#dashboard').classList.add('hidden');
    $('#userBox').textContent = '';
    return;
  }
  $('#loginView').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#userBox').textContent = `Conectado como ${Session.user}`;
  $('#ownerName').textContent = Session.user;

  refreshProductsUI();
  refreshSalesUI();
  refreshAlerts();
  refreshCharts();
  refreshUsersAdmin();
  populateSaleProducts();
  refreshTaxReport();
  refreshPerformance();
  // Solo admin puede ver la pestaña Admin
  const adminTabBtn = $(`.tab[data-tab="adminTab"]`);
  if(Session.user==='admin'){ adminTabBtn.classList.remove('hidden'); }
  else { adminTabBtn.classList.add('hidden'); }
}

$('#btnLogout').addEventListener('click', ()=>{ sessionStorage.removeItem('bodega:user'); initApp(); });

/****************************
 * Tabs
 ****************************/
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tabPanel').forEach(p=>p.classList.add('hidden'));
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
    // If charts tab opened, refresh charts after a small delay (for correct sizing)
    if(btn.dataset.tab === 'graficosTab') {
      setTimeout(()=>{ refreshCharts(); if(window.lineChart) window.lineChart.resize(); }, 80);
    }
    if(btn.dataset.tab === 'tributarioTab') {
      refreshTaxReport();
    }
  })
});

/****************************
 * Productos (CRUD)
 ****************************/
function readProductForm(){
  return {
    id: uid(),
    name: $('#pName').value.trim(),
    sku: $('#pSku').value.trim(),
    category: $('#pCat').value.trim(),
    unitCost: Number($('#pCost').value||0),
    price: Number($('#pPrice').value||0),
    qty: parseInt($('#pQty').value||0,10),
    expiry: $('#pExp').value || null,
    createdAt: todayISO(),
  };
}

function clearProductForm(){
  ['#pName','#pSku','#pCat','#pCost','#pPrice','#pQty','#pExp'].forEach(s=>$(s).value='');
}

function addProduct(){
  const p = readProductForm();
  if(!p.name || !p.sku){ alert('Nombre y SKU son obligatorios'); return }
  if(p.qty<0 || p.unitCost<0 || p.price<0){ alert('Valores no válidos'); return }
  const list = DB.products();
  list.push(p);
  DB.saveProducts(list);
  clearProductForm();
  refreshProductsUI();
  populateSaleProducts();
  refreshAlerts();
  refreshPerformance();
}

$('#btnAdd').addEventListener('click', addProduct);
$('#btnClear').addEventListener('click', clearProductForm);

function renderProductRow(p){
  const totalCost = p.qty * p.unitCost;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="input inline" value="${p.name}" data-field="name" /></td>
    <td><input class="input inline" value="${p.sku}" data-field="sku" /></td>
    <td><input class="input inline" value="${p.category||''}" data-field="category" /></td>
    <td><input class="input inline" type="number" step="0.01" value="${p.unitCost}" data-field="unitCost" /></td>
    <td><input class="input inline" type="number" step="0.01" value="${p.price}" data-field="price" /></td>
    <td><input class="input inline" type="number" step="1" value="${p.qty}" data-field="qty" /></td>
    <td>${fmtMoney(totalCost)}</td>
    <td><input class="input inline" type="date" value="${p.expiry||''}" data-field="expiry" /></td>
    <td>${renderExpiryBadge(p)}</td>
    <td>
      <button class="btn flat" data-action="save">Guardar</button>
      <button class="btn flat" data-action="del">Eliminar</button>
    </td>
  `;
  tr.querySelector('[data-action="save"]').addEventListener('click', ()=> saveRow(tr, p.id));
  tr.querySelector('[data-action="del"]').addEventListener('click', ()=> deleteProduct(p.id));
  return tr;
}

function renderExpiryBadge(p){
  if(!p.expiry) return '<span class="pill">Sin FV</span>';
  const now = new Date();
  const exp = new Date(p.expiry);
  const diffDays = Math.ceil((exp - now) / (1000*60*60*24));
  if(p.qty<=0) return '<span class="pill">Sin stock</span>';
  if(diffDays < 0) return `<span class="pill red">Vencido ${prettyDate(p.expiry)}</span>`;
  if(diffDays <= 7) return `<span class="pill yellow">Vence pronto (${diffDays} día(s))</span>`;
  return `<span class="pill green">OK (${prettyDate(p.expiry)})</span>`;
}

function saveRow(tr, id){
  const inputs = tr.querySelectorAll('input.inline');
  const list = DB.products();
  const idx = list.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const obj = {...list[idx]};
  inputs.forEach(inp=>{
    const f = inp.dataset.field;
    let val = inp.value;
    if(['unitCost','price','qty'].includes(f)) val = Number(val);
    obj[f] = val;
  });
  list[idx]=obj;
  DB.saveProducts(list);
  refreshProductsUI();
  populateSaleProducts();
  refreshAlerts();
  refreshPerformance();
}

function deleteProduct(id){
  if(!confirm('¿Eliminar producto?')) return;
  const list = DB.products().filter(x=>x.id!==id);
  DB.saveProducts(list);
  refreshProductsUI();
  populateSaleProducts();
  refreshAlerts();
  refreshPerformance();
}

function refreshProductsUI(){
  const term = $('#search').value?.toLowerCase?.()||'';
  const list = DB.products().filter(p=>
    p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
  );
  const tbody = $('#stockTable tbody');
  tbody.innerHTML = '';
  list.forEach(p=> tbody.appendChild(renderProductRow(p)) );

  // KPI
  const all = DB.products();
  const items = all.length;
  const costoTotal = all.reduce((acc,p)=> acc + p.qty * p.unitCost, 0);
  $('#kpiItems').textContent = items;
  $('#kpiCosto').textContent = fmtMoney(costoTotal);
}

$('#search').addEventListener('input', refreshProductsUI);

/****************************
 * Alertas de vencimiento
 ****************************/
function computeAlerts(){
  const list = DB.products();
  const alerts = [];
  const now = new Date();
  for(const p of list){
    if(!p.expiry) continue;
    const exp = new Date(p.expiry);
    const diffDays = Math.ceil((exp - now) / (1000*60*60*24));
    if(p.qty<=0) continue; // si no hay stock, no alertar
    if(diffDays < 0){
      alerts.push({type:'danger', msg:`DESECHAR PRODUCTO "${p.name}" – venció el ${prettyDate(p.expiry)}`});
    } else if(diffDays <= 7){
      alerts.push({type:'warn', msg:`"${p.name}" está por vencer en ${diffDays} día(s) (${prettyDate(p.expiry)})`});
    }
  }
  return alerts;
}

function refreshAlerts(){
  const list = computeAlerts();
  $('#kpiAlerts').textContent = list.length;
  const box = $('#alerts');
  box.innerHTML = '';
  list.forEach(a=>{
    const div = document.createElement('div');
    div.className = `alert-item ${a.type==='danger'?'alert-danger':'alert-warn'}`;
    div.textContent = a.msg;
    box.appendChild(div);
  })
}

// Recalcular alertas cada 60s
setInterval(()=>{ if(Session.user) refreshAlerts(); }, 60000);

/****************************
 * Ventas (autocomplete)
 ****************************/
let AUTOCOMPLETE_LIST = [];
const saleInput = $('#saleProduct');
const suggBox = $('#saleSuggestions');

function populateSaleProducts(){
  AUTOCOMPLETE_LIST = DB.products().map(p=>({
    id: p.id,
    name: p.name,
    sku: p.sku,
    qty: p.qty,
    price: p.price,
    unitCost: p.unitCost
  }));
  if(saleInput){
    const currentText = saleInput.value.trim().toLowerCase();
    if(!currentText) saleInput.removeAttribute('data-selected-id');
    else {
      const found = AUTOCOMPLETE_LIST.find(it => it.name.toLowerCase() === currentText || it.sku.toLowerCase() === currentText);
      if(found) saleInput.setAttribute('data-selected-id', found.id);
    }
  }
  renderSuggestions([], true);
}

function renderSuggestions(list, hide=false){
  if(!suggBox) return;
  if(hide || !list || list.length===0){
    suggBox.classList.add('hidden');
    suggBox.innerHTML = '';
    return;
  }
  suggBox.classList.remove('hidden');
  suggBox.innerHTML = '';
  list.forEach((it, idx)=>{
    const div = document.createElement('div');
    div.className = 'item';
    div.setAttribute('role','option');
    div.setAttribute('data-id', it.id);
    div.innerHTML = `<div class="title">${it.name}</div><div class="sub">${it.sku} · Stock: ${it.qty} · ${fmtMoney(it.price)}</div>`;
    div.addEventListener('click', ()=>{
      if(saleInput){
        saleInput.value = it.name;
        saleInput.setAttribute('data-selected-id', it.id);
        // autocompletar precio por defecto
        if(it.price !== undefined) $('#salePrice').value = it.price;
      }
      renderSuggestions([], true);
    });
    suggBox.appendChild(div);
  });
}

function filterAutocomplete(query){
  if(!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  return AUTOCOMPLETE_LIST.filter(it => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)).slice(0,12);
}

let suggestionIndex = -1;
if(saleInput){
  saleInput.addEventListener('input', (e)=>{
    const q = e.target.value;
    suggestionIndex = -1;
    const arr = filterAutocomplete(q);
    renderSuggestions(arr, arr.length===0);
  });

  saleInput.addEventListener('keydown', (e)=>{
    const items = suggBox ? Array.from(suggBox.querySelectorAll('.item')) : [];
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      if(items.length === 0) return;
      suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1);
      items.forEach((it,i)=> it.classList.toggle('active', i===suggestionIndex));
      items[suggestionIndex].scrollIntoView({block:'nearest'});
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      if(items.length === 0) return;
      suggestionIndex = Math.max(suggestionIndex - 1, 0);
      items.forEach((it,i)=> it.classList.toggle('active', i===suggestionIndex));
      items[suggestionIndex].scrollIntoView({block:'nearest'});
    } else if(e.key === 'Enter'){
      const active = suggBox ? suggBox.querySelector('.item.active') : null;
      if(active){
        e.preventDefault();
        const id = active.getAttribute('data-id');
        const found = AUTOCOMPLETE_LIST.find(x=>x.id===id);
        if(found && saleInput){
          saleInput.value = found.name;
          saleInput.setAttribute('data-selected-id', id);
          if(found.price !== undefined) $('#salePrice').value = found.price;
        }
        renderSuggestions([], true);
      }
    } else if(e.key === 'Escape'){
      renderSuggestions([], true);
    }
  });
}

document.addEventListener('click', (ev)=>{
  if(!saleInput || !suggBox) return;
  if(!ev.composedPath().includes(saleInput) && !ev.composedPath().includes(suggBox)){
    renderSuggestions([], true);
  }
});

/****************************
 * Añadir venta
 ****************************/
function addSale(){
  if(!saleInput){
    $('#saleMsg').textContent = 'Campo de producto no disponible';
    return;
  }
  const typed = saleInput.value.trim();
  let productId = saleInput.getAttribute('data-selected-id') || null;
  if(!productId && typed){
    const exact = AUTOCOMPLETE_LIST.find(p => p.name.toLowerCase() === typed.toLowerCase() || p.sku.toLowerCase() === typed.toLowerCase());
    if(exact) productId = exact.id;
  }

  const qty = parseInt($('#saleQty').value||0,10);
  const price = Number($('#salePrice').value||0);
  const date = $('#saleDate').value || todayISO();
  const products = DB.products();
  const p = products.find(x=>x.id===productId);
  if(!p){
    $('#saleMsg').textContent = 'Seleccione producto válido desde las sugerencias';
    return;
  }
  if(qty<=0){ $('#saleMsg').textContent = 'Cantidad inválida'; return }
  if(qty>p.qty){ $('#saleMsg').textContent = 'Stock insuficiente'; return }
  const revenue = qty * price;
  const cost = qty * Number(p.unitCost||0);
  const util = revenue - cost;

  // guardar venta
  const sales = DB.sales();
  sales.push({ id: uid(), productId, name:p.name, qty, price, revenue, cost, profit: util, date });
  DB.saveSales(sales);

  // descontar stock
  p.qty -= qty;
  DB.saveProducts(products);

  $('#saleMsg').textContent = 'Venta registrada';
  $('#saleQty').value='';
  $('#salePrice').value='';
  saleInput.value = '';
  saleInput.removeAttribute('data-selected-id');

  refreshSalesUI();
  refreshProductsUI();
  populateSaleProducts();
  refreshAlerts();
  refreshCharts();
  refreshTaxReport();
  refreshPerformance();
}

$('#btnSale').addEventListener('click', addSale);

/****************************
 * Ventas UI
 ****************************/
function refreshSalesUI(){
  const tb = $('#salesTable tbody');
  const list = DB.sales().sort((a,b)=> a.date.localeCompare(b.date));
  tb.innerHTML = '';
  list.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${prettyDate(s.date)}</td>
      <td>${s.name}</td>
      <td>${s.qty}</td>
      <td>${fmtMoney(s.price)}</td>
      <td>${fmtMoney(s.revenue)}</td>
      <td>${fmtMoney(s.cost)}</td>
      <td>${fmtMoney(s.profit)}</td>
      <td><button class="btn flat" data-id="${s.id}">Eliminar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', ()=> deleteSale(s.id));
    tb.appendChild(tr);
  })

  const ingresos = list.reduce((a,x)=>a+x.revenue,0);
  const costos = list.reduce((a,x)=>a+x.cost,0);
  const utilidad = ingresos - costos;
  $('#kpiVentas').textContent = list.length;
  $('#kpiIngresos').textContent = fmtMoney(ingresos);
  $('#kpiUtilidad').textContent = fmtMoney(utilidad);
}

/****************************
 * Eliminar venta (repone stock)
 ****************************/
function deleteSale(id){
  if(!confirm('¿Eliminar registro de venta?')) return;
  const list = DB.sales();
  const idx = list.findIndex(x=>x.id===id);
  if(idx===-1) return;
  // reponer stock
  const s = list[idx];
  const products = DB.products();
  const p = products.find(x=>x.id===s.productId);
  if(p){ p.qty += s.qty; DB.saveProducts(products); }
  list.splice(idx,1);
  DB.saveSales(list);
  refreshSalesUI();
  refreshProductsUI();
  populateSaleProducts();
  refreshAlerts();
  refreshCharts();
  refreshTaxReport();
  refreshPerformance();
}

/****************************
 * Charts (Chart.js)
 ****************************/
let lineChart;
function refreshCharts(){
  // Serie diaria últimos 30 días
  const days = [];
  const mapRevenue = new Map();
  const mapCost = new Map();
  const now = new Date();
  for(let i=29;i>=0;i--){
    const d = new Date(now); d.setDate(now.getDate()-i);
    const key = toISO(d);
    days.push(prettyDate(key));
    mapRevenue.set(key,0); mapCost.set(key,0);
  }
  DB.sales().forEach(s=>{
    const sdate = (s.date||'').slice(0,10);
    if(mapRevenue.has(sdate)){
      mapRevenue.set(sdate, mapRevenue.get(sdate)+Number(s.revenue||0));
      mapCost.set(sdate, mapCost.get(sdate)+Number(s.cost||0));
    }
  });
  const revSeries = Array.from(mapRevenue.values());
  const costSeries = Array.from(mapCost.values());

  const canvasEl = document.getElementById('chartLine');
  if(!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  if(lineChart) lineChart.destroy();

  lineChart = new Chart(ctx, {
    type:'line',
    data:{ labels: days, datasets:[
      { label:'Ingresos', data: revSeries, tension:0.25, fill:false, borderWidth:2 },
      { label:'Costo', data: costSeries, tension:0.25, fill:false, borderWidth:2 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#e5e7eb' } } },
      scales:{ x:{ ticks:{ color:'#9ca3af'} }, y:{ ticks:{ color:'#9ca3af' }, beginAtZero:true } }
    }
  });
}

/****************************
 * RENDIMIENTO POR PRODUCTO
 ****************************/
function refreshPerformance(){
  const tbody = document.querySelector('#rendimientoProductoTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '';

  // Map productId => {name, ingresos, costos, ganancia}
  const perf = new Map();
  // initialize with products (so even products without sales appear)
  DB.products().forEach(p=>{
    perf.set(p.id, { name: p.name, ingresos:0, costos:0, ganancia:0 });
  });

  DB.sales().forEach(s=>{
    const p = perf.get(s.productId) || { name: s.name || '—', ingresos:0, costos:0, ganancia:0 };
    p.ingresos += Number(s.revenue || 0);
    p.costos += Number(s.cost || 0);
    p.ganancia = p.ingresos - p.costos;
    perf.set(s.productId, p);
  });

  // Convert map to array sorted by ingresos desc
  const arr = Array.from(perf.values()).sort((a,b)=> b.ingresos - a.ingresos);

  arr.forEach(item=>{
    const tr = document.createElement('tr');
    const gain = item.ganancia || 0;
    const cost = item.costos || 0;
    let rentPct = 0;
    if(cost === 0){
      rentPct = item.ingresos > 0 ? 9999 : 0;
    } else {
      rentPct = (gain / cost) * 100;
    }
    // decide class
    let cls = 'perf-warn';
    if(rentPct > 10) cls = 'perf-good';
    else if(rentPct < 0) cls = 'perf-bad';
    tr.className = cls;
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${fmtMoney(item.ingresos)}</td>
      <td>${fmtMoney(item.costos)}</td>
      <td>${fmtMoney(gain)}</td>
      <td>${cost===0 && item.ingresos>0 ? '—' : rentPct === 9999 ? '—' : `${rentPct.toFixed(2)} %`}</td>
    `;
    tbody.appendChild(tr);
  });
}

/****************************
 * NUEVO: Reporte Tributario (NRUS)
 ****************************/
const NRUS = {
  MONTHLY_LIMIT: 8000,
  YEARLY_LIMIT: 96000,
  CAT1_LIMIT: 5000,
  WARNING_RATIO: 0.85, // 85% del tope -> amarillo
};

function getMonthlyRevenueCurrent(){
  const mk = new Date().toISOString().slice(0,7); // YYYY-MM
  return DB.sales().reduce((acc,s)=> {
    const sd = (s.date||'').slice(0,7);
    return acc + (sd === mk ? Number(s.revenue||0) : 0);
  }, 0);
}
function getYearlyRevenueCurrent(){
  const yk = new Date().toISOString().slice(0,4); // YYYY
  return DB.sales().reduce((acc,s)=> {
    const sy = (s.date||'').slice(0,4);
    return acc + (sy === yk ? Number(s.revenue||0) : 0);
  }, 0);
}

function paintStatus(el, state){
  el.classList.remove('ok','warn','over');
  el.classList.add(state);
}

function refreshTaxReport(){
  if(!Session.user) return;

  // MENSUAL
  const m = getMonthlyRevenueCurrent();
  $('#rtMonthlyAmount').textContent = fmtMoney(m);
  const mLeft = Math.max(0, NRUS.MONTHLY_LIMIT - m);
  $('#rtMonthlyLeft').textContent = `Restante del tope mensual: ${fmtMoney(mLeft)} (tope: S/ ${NRUS.MONTHLY_LIMIT.toFixed(2)})`;

  const mBox = $('#rtMonthly');
  if(m <= NRUS.MONTHLY_LIMIT * NRUS.WARNING_RATIO){
    paintStatus(mBox,'ok');
    $('#rtMonthlyMsg').textContent = 'En rango permitido del NRUS para este mes.';
  } else if(m <= NRUS.MONTHLY_LIMIT){
    paintStatus(mBox,'warn');
    $('#rtMonthlyMsg').textContent = 'Atención: estás cerca de alcanzar el tope mensual del NRUS.';
  } else {
    paintStatus(mBox,'over');
    $('#rtMonthlyMsg').textContent = 'Has superado el tope mensual del NRUS. Evalúa si corresponde cambiar de régimen.';
  }

  // ANUAL
  const y = getYearlyRevenueCurrent();
  $('#rtYearlyAmount').textContent = fmtMoney(y);
  const yLeft = Math.max(0, NRUS.YEARLY_LIMIT - y);
  $('#rtYearlyLeft').textContent = `Restante del tope anual: ${fmtMoney(yLeft)} (tope: S/ ${NRUS.YEARLY_LIMIT.toFixed(2)})`;

  const yBox = $('#rtYearly');
  if(y <= NRUS.YEARLY_LIMIT * NRUS.WARNING_RATIO){
    paintStatus(yBox,'ok');
    $('#rtYearlyMsg').textContent = 'En rango permitido del NRUS para este año.';
  } else if(y <= NRUS.YEARLY_LIMIT){
    paintStatus(yBox,'warn');
    $('#rtYearlyMsg').textContent = 'Atención: estás cerca de alcanzar el tope anual del NRUS.';
  } else {
    paintStatus(yBox,'over');
    $('#rtYearlyMsg').textContent = 'Has superado el tope anual del NRUS. Evalúa si corresponde cambiar de régimen.';
  }

  // CATEGORÍA (según ventas del mes)
  const catEl = $('#rtNRUSCat');
  const noteEl = $('#rtNRUSNote');
  if(catEl){
    catEl.classList.remove('nrusCat1','nrusCat2','nrusOut');
    if(m <= NRUS.CAT1_LIMIT){
      catEl.textContent = 'Categoría 1 (cuota S/ 20)';
      catEl.classList.add('nrusCat1');
      noteEl.textContent = 'Tus ventas del mes están en Categoría 1 del NRUS.';
    } else if(m > NRUS.CAT1_LIMIT && m <= NRUS.MONTHLY_LIMIT){
      catEl.textContent = 'Categoría 2 (cuota S/ 50)';
      catEl.classList.add('nrusCat2');
      noteEl.textContent = 'Tus ventas del mes están en Categoría 2 del NRUS.';
    } else {
      catEl.textContent = 'Fuera de límite NRUS (mensual)';
      catEl.classList.add('nrusOut');
      noteEl.textContent = 'Has superado el tope mensual del NRUS; podría corresponder migrar de régimen.';
    }
  }
}

/****************************
 * Exportar a Excel (SheetJS)
 ****************************/
function exportJSONtoXLSX(filename, sheets){
  const wb = XLSX.utils.book_new();
  for(const {name, data} of sheets){
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

$('#btnExportStock').addEventListener('click', ()=>{
  const data = DB.products().map(p=>({
    Nombre:p.name, SKU:p.sku, Categoria:p.category, CostoUnidad:p.unitCost, Precio:p.price, Stock:p.qty,
    CostoTotal: (p.qty*p.unitCost), Vence: prettyDate(p.expiry)
  }));
  const fname = `${Session.user}_stock_${todayISO()}.xlsx`;
  exportJSONtoXLSX(fname, [{name:'Stock', data}]);
});

$('#btnExportSales').addEventListener('click', ()=>{
  const data = DB.sales().map(s=>({
    Fecha: prettyDate(s.date), Producto:s.name, Cantidad:s.qty, Precio:s.price, Ingresos:s.revenue, Costo:s.cost, Utilidad:s.profit
  }));
  const fname = `${Session.user}_ventas_${todayISO()}.xlsx`;
  exportJSONtoXLSX(fname, [{name:'Ventas', data}]);
});

/****************************
 * Admin – crear usuarios (solo admin)
 ****************************/
function refreshUsersAdmin(){
  if(Session.user!=='admin'){ $('#usersList').innerHTML = '<em>No autorizado</em>'; return; }
  const all = Users.all();
  const box = $('#usersList');
  box.innerHTML = '';
  const ul = document.createElement('ul');
  Object.entries(all).forEach(([u,p])=>{
    const li = document.createElement('li');
    li.innerHTML = `<code>${u}</code> <button class="btn flat" data-u="${u}">Eliminar</button>`
    if(u==='admin') li.querySelector('button').disabled=true;
    ul.appendChild(li);
  });
  box.appendChild(ul);
  box.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const u = b.dataset.u; if(confirm(`¿Eliminar ${u}?`)){ Users.remove(u); refreshUsersAdmin(); }
    })
  })
}

$('#btnCreateUser').addEventListener('click', ()=>{
  if(Session.user!=='admin'){ $('#adminMsg').textContent='No autorizado'; return }
  const u = $('#newU').value.trim();
  const p = $('#newP').value;
  if(!u||!p){ $('#adminMsg').textContent='Complete usuario y contraseña'; return }
  if(Users.create(u,p)){
    $('#adminMsg').textContent='Usuario creado';
    $('#newU').value=''; $('#newP').value='';
    refreshUsersAdmin();
  } else {
    $('#adminMsg').textContent='El usuario ya existe';
  }
});

/****************************
 * Inicialización
 ****************************/
document.getElementById('year').textContent = new Date().getFullYear();
$('#saleDate').value = todayISO();
if(Session.user){ initApp(); }
else { $('#loginView').classList.remove('hidden'); }

// También actualizamos el Reporte Tributario si cambian de pestaña (por si hay retraso en DOM)
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) { refreshTaxReport(); refreshPerformance(); } });
