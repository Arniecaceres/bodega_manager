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
      refreshTaxReport(); // <— NUEVO
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
    }

    function deleteProduct(id){
      if(!confirm('¿Eliminar producto?')) return;
      const list = DB.products().filter(x=>x.id!==id);
      DB.saveProducts(list);
      refreshProductsUI();
      populateSaleProducts();
      refreshAlerts();
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
     * Ventas
     ****************************/
    function populateSaleProducts(){
      const sel = $('#saleProduct');
      sel.innerHTML = '';
      DB.products().forEach(p=>{
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = `${p.name} (${p.sku}) – Stock: ${p.qty}`;
        sel.appendChild(opt);
      });
    }

    function addSale(){
      const productId = $('#saleProduct').value;
      const qty = parseInt($('#saleQty').value||0,10);
      const price = Number($('#salePrice').value||0);
      const date = $('#saleDate').value || todayISO();
      const products = DB.products();
      const p = products.find(x=>x.id===productId);
      if(!p){ $('#saleMsg').textContent = 'Seleccione producto'; return }
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

      refreshSalesUI();
      refreshProductsUI();
      populateSaleProducts();
      refreshAlerts();
      refreshCharts();
      refreshTaxReport(); // <— NUEVO: actualizar reporte tributario
    }

    $('#btnSale').addEventListener('click', addSale);

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
      refreshTaxReport(); // <— NUEVO: actualizar reporte tributario
    }

    /****************************
     * Gráficos y evaluación
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
        if(mapRevenue.has(s.date)){
          mapRevenue.set(s.date, mapRevenue.get(s.date)+s.revenue);
          mapCost.set(s.date, mapCost.get(s.date)+s.cost);
        }
      });
      const revSeries = Array.from(mapRevenue.values());
      const costSeries = Array.from(mapCost.values());

      const ctx = document.getElementById('chartLine');
      if(lineChart) lineChart.destroy();
      lineChart = new Chart(ctx, {
        type:'line',
        data:{ labels: days, datasets:[
          { label:'Ingresos', data: revSeries },
          { label:'Costo', data: costSeries },
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ labels:{ color:'#e5e7eb' } } },
          scales:{ x:{ ticks:{ color:'#9ca3af'} }, y:{ ticks:{ color:'#9ca3af' } } }
        }
      });

      // Rendimiento por producto (flechas)
      const perfBox = $('#scoreList');
      perfBox.innerHTML = '';
      const byProd = new Map();
      DB.sales().forEach(s=>{
        const k = s.productId; if(!byProd.has(k)) byProd.set(k,{name:s.name, qty:0});
        byProd.get(k).qty += s.qty;
      });
      DB.products().forEach(p=>{ if(!byProd.has(p.id)) byProd.set(p.id,{name:p.name, qty:0}); });
      const arr = Array.from(byProd.values()).sort((a,b)=> b.qty-a.qty);
      const top = arr.slice(0,8);
      const max = top.length? top[0].qty : 0;
      top.forEach((it)=>{
        const ratio = max? it.qty / max : 0;
        let arrow = '—', cls='flat';
        if(ratio>=0.66) { arrow='▲'; cls='up'; }
        else if(ratio<=0.33 && it.qty>0){ arrow='▼'; cls='down'; }
        const row = document.createElement('div');
        row.className = 'kpi';
        row.innerHTML = `<span class="arrow ${cls}">${arrow}</span> <div class="value" style="min-width:38px">${it.qty}</div> <div class="subtle">${it.name}</div>`;
        perfBox.appendChild(row);
      })
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
      const mk = monthKey(new Date());
      return DB.sales().reduce((acc,s)=> acc + (monthKey(s.date)===mk ? s.revenue : 0), 0);
    }
    function getYearlyRevenueCurrent(){
      const yk = yearKey(new Date());
      return DB.sales().reduce((acc,s)=> acc + (yearKey(s.date)===yk ? s.revenue : 0), 0);
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
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshTaxReport(); });
