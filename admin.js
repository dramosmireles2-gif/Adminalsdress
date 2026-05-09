// =============================================
// admin.js — Supabase
// =============================================

const datosGlobales = { inventario: [], rentas: [], clientes: [] };
let itemEditing  = null;
let rentaEditing = null;
let calendarInst = null;

function nombreArticulo(r) {
    // Acepta tanto un objeto renta como un string de id_articulo (compat)
    const id = typeof r === 'string' ? r : r?.id_articulo;
    if (!id) {
        // id_articulo null = vestido externo o crédito
        if (typeof r === 'object') {
            if (r?.estatus_renta === 'Credito' || r?.estatus_renta === 'Credito Usado') return 'Crédito a favor';
            const firstLine = (r?.ajustes || '').split('\n')[0].trim();
            return firstLine ? firstLine + ' ✦' : 'Vestido externo ✦';
        }
        return '—';
    }
    if (id === 'CREDITO') return 'Crédito a favor'; // compat con registros viejos
    if (id.startsWith('EXT:')) return id.slice(4) + ' ✦'; // compat con registros viejos
    const item = datosGlobales.inventario.find(i => i.id_articulo === id);
    return item?.nombre || id;
}

// ---- HELPER: URL de foto (AppSheet + Supabase + HTTP) ----
function obtenerUrlFoto(foto, size) {
    const placeholder = size === 'sm'
        ? 'https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'
        : 'https://placehold.co/100x120/f5f1eb/8a8a8e?text=Foto';
    if (!foto) return placeholder;
    if (foto.startsWith('http')) return foto;
    return `https://www.appsheet.com/template/gettablefileurl?appName=RentaVestidosAPP-250346467&tableName=Inventario&fileName=${encodeURIComponent(foto)}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    await cargarTodo();
    renderizarInventario(datosGlobales.inventario);
});

async function cargarTodo() {
    const [inv, rentas, clientes] = await Promise.all([
        sb.from('inventario').select('*').order('nombre'),
        sb.from('rentas').select('*').order('created_at', { ascending: false }),
        sb.from('clientes').select('*').order('nombre_completo')
    ]);
    datosGlobales.inventario = inv.data    || [];
    datosGlobales.rentas     = rentas.data || [];
    datosGlobales.clientes   = clientes.data || [];
}

function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('nav button').forEach(el => {
        el.classList.remove('active','border-pink-600','text-pink-600');
        el.classList.add('text-gray-400','border-transparent');
    });
    const seccion = document.getElementById('sec-' + tab);
    const boton   = document.getElementById('btn-tab-' + tab);
    if (seccion && boton) {
        seccion.classList.remove('hidden');
        boton.classList.add('active','border-pink-600','text-pink-600');
        boton.classList.remove('text-gray-400','border-transparent');
        if (tab === 'clientes')   renderizarClientes();
        if (tab === 'rentas')     renderizarRentas(datosGlobales.rentas);
        if (tab === 'finanzas')   renderizarDashboard();
        if (tab === 'calendario') setTimeout(() => renderizarCalendario(), 150);
    }
}

let filtroActual      = '';
let tipoActual        = '';
let filtroTallaActual = '';

function filtrarTipo(tipo) { tipoActual = tipo; filtroTallaActual = ''; renderizarInventario(datosGlobales.inventario); }
function filtrarTalla(talla) { filtroTallaActual = talla; renderizarInventario(datosGlobales.inventario); }

function renderizarFiltroTallas(lista) {
    const container = document.getElementById('filtro-tallas-container');
    if (!container) return;
    const tallas = [...new Set(lista.map(i => i.talla).filter(t => t && t !== 'UNI'))].sort((a, b) => {
        const order = ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'];
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return parseFloat(a) - parseFloat(b);
    });
    if (!tallas.length) { container.innerHTML = ''; return; }
    container.innerHTML = '';
    const btnTodo = document.createElement('button');
    btnTodo.className = 'whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold transition-all ' + (!filtroTallaActual ? 'bg-pink-600 text-white' : 'bg-white border border-gray-200 text-gray-500');
    btnTodo.textContent = 'Todas';
    btnTodo.onclick = () => filtrarTalla('');
    container.appendChild(btnTodo);
    tallas.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold transition-all ' + (filtroTallaActual === t ? 'bg-pink-600 text-white' : 'bg-white border border-gray-200 text-gray-600');
        btn.textContent = t;
        btn.onclick = () => filtrarTalla(t);
        container.appendChild(btn);
    });
}

function renderizarInventario(lista) {
    const contenedor = document.getElementById('lista-admin');
    if (!contenedor) return;
    const busqueda = (document.getElementById('buscador')?.value || '').toLowerCase();
    const prefiltrada = lista.filter(i => {
        const txt  = !busqueda || (i.nombre||'').toLowerCase().includes(busqueda) || (i.id_articulo||'').toLowerCase().includes(busqueda);
        const est  = !filtroActual || i.estado_actual === filtroActual;
        const tipo = !tipoActual   || (i.tipo || 'Vestido') === tipoActual;
        return txt && est && tipo;
    });
    renderizarFiltroTallas(prefiltrada);
    const filtrada = prefiltrada.filter(i => !filtroTallaActual || i.talla === filtroTallaActual);
    if (!filtrada.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No se encontraron artículos.</p>';
        return;
    }
    contenedor.innerHTML = '';
    filtrada.forEach(item => {
        const cfg = { Disponible:{color:'bg-green-100 text-green-700'}, Rentado:{color:'bg-blue-100 text-blue-700'}, Limpieza:{color:'bg-yellow-100 text-yellow-700'} }[item.estado_actual] || {color:'bg-gray-100 text-gray-500'};
        const fotoUrl = obtenerUrlFoto(item.foto, 'sm');
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<img src="${fotoUrl}" class="w-14 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm truncate">${item.nombre||'—'}</p>
                <p class="text-[10px] text-gray-400 font-mono mt-0.5">${item.codigo||item.id_articulo}</p>
                <div class="flex items-center gap-2 mt-1.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}">${item.estado_actual}</span>
                    <span class="text-[10px] text-gray-400">Talla: <b>${item.talla||'—'}</b></span>
                    ${item.publicado ? '<span class="text-[10px] text-pink-500 font-bold">● Web</span>' : '<span class="text-[10px] text-gray-300">○ Oculto</span>'}
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-pink-600 font-black text-sm">$${item.precio_base||0}</p>
                <span class="material-icons-round text-gray-300 text-xl mt-1">chevron_right</span>
            </div>`;
        card.onclick = () => abrirModal(item);
        contenedor.appendChild(card);
    });
}

document.getElementById('buscador')?.addEventListener('input', () => renderizarInventario(datosGlobales.inventario));
function filtrarInventario(estado) { filtroActual = estado; renderizarInventario(datosGlobales.inventario); }

function abrirModal(item) {
    itemEditing = item;
    document.getElementById('modal-titulo').textContent    = item.nombre || '—';
    document.getElementById('modal-subtitulo').textContent = item.id_articulo + ' · Talla ' + item.talla;
    const toggle = document.getElementById('toggle-publicado');
    if (toggle) toggle.checked = !!item.publicado;

    // Precargar campos de edición
    document.getElementById('edit-nombre').value        = item.nombre || '';
    document.getElementById('edit-precio').value        = item.precio_base || '';
    document.getElementById('edit-color').value         = item.color || '';
    document.getElementById('edit-precio-venta').value  = item.precio_venta || '';
    document.getElementById('edit-tipo').value          = item.tipo || 'Vestido';
    actualizarTallaEdicion();
    document.getElementById('edit-talla').value         = item.talla || '';

    // Resetear al tab de estado
    cambiarTabModal('estado');

    document.getElementById('modal-editar').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function cerrarModal() {
    document.getElementById('modal-editar').classList.add('hidden');
    document.body.style.overflow = '';
    itemEditing = null;
}
async function guardarEstado(nuevoEstado) {
    if (!itemEditing) return;
    const idArticulo = itemEditing.id_articulo;
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    cerrarModal();
    const { error } = await sb.from('inventario').update({ estado_actual: nuevoEstado }).eq('id_articulo', idArticulo);
    if (error) { Swal.fire('Error','No se pudo actualizar.','error'); return; }
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon:'success', title:'Marcado como ' + nuevoEstado, timer:1000, showConfirmButton:false });
}
async function cambiarVisibilidadWeb(publicado) {
    if (!itemEditing) return;
    const idArticulo = itemEditing.id_articulo;
    const { error } = await sb.from('inventario').update({ publicado }).eq('id_articulo', idArticulo);
    if (error) { Swal.fire('Error','No se pudo cambiar visibilidad.','error'); return; }
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].publicado = publicado;
        itemEditing.publicado = publicado;
    }
    renderizarInventario(datosGlobales.inventario);
}

function renderizarRentas(lista) {
    const contenedor = document.getElementById('lista-rentas');
    if (!contenedor) return;
    const activas = lista.filter(r => r.estatus_renta === 'Activa');
    if (!activas.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No hay rentas activas.</p>';
        return;
    }
    contenedor.innerHTML = '';
    activas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
        const saldo   = parseFloat(r.saldo_pendiente) || 0;
        const fotoUrl = obtenerUrlFoto(vestido?.foto, 'sm');
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<img src="${fotoUrl}" class="w-14 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm truncate">${cliente?.nombre_completo||r.id_cliente||'—'}</p>
                <p class="text-xs text-pink-600 font-medium truncate mt-0.5">${nombreArticulo(r)}</p>
                <div class="flex gap-2 mt-1.5 text-[10px] text-gray-400">
                    <span>📅 ${r.fecha_evento||'—'}</span>
                    <span>↩ ${r.fecha_retorno||'—'}</span>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="font-black text-sm ${saldo>0?'text-red-500':'text-green-600'}">$${saldo.toFixed(0)}</p>
                <p class="text-[9px] text-gray-400 mt-0.5">${saldo>0?'pendiente':'pagado'}</p>
            </div>`;
        card.onclick = () => abrirModalRenta(r);
        contenedor.appendChild(card);
    });
}

function abrirModalRenta(r) {
    rentaEditing = r;
    const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
    const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
    const fotoUrl = obtenerUrlFoto(vestido?.foto, 'lg');
    document.getElementById('renta-modal-foto').src           = fotoUrl;
    document.getElementById('renta-modal-cliente').textContent = cliente?.nombre_completo || r.id_cliente;
    document.getElementById('renta-modal-vestido').textContent = nombreArticulo(r);
    document.getElementById('renta-modal-id').textContent      = r.id_renta;
    document.getElementById('renta-modal-saldo').textContent   = '$' + (parseFloat(r.saldo_pendiente)||0).toFixed(2);
    document.getElementById('renta-modal-fecha-e').textContent = r.fecha_entrega || '—';
    document.getElementById('renta-modal-fecha-r').textContent = r.fecha_retorno || '—';
    document.getElementById('renta-modal-ajustes').textContent = r.ajustes || 'Sin ajustes registrados.';
    // Resetear editor de ajustes
    document.getElementById('ajustes-edit-section').classList.add('hidden');
    document.getElementById('renta-modal-ajustes').classList.remove('hidden');
    document.getElementById('btn-editar-ajustes').textContent = 'Editar';

    const tel = cliente?.telefono;
    const btnWA = document.getElementById('btn-whatsapp-renta');
    if (tel) { btnWA.onclick = () => enviarRecordatorioWhatsApp(cliente, r, vestido); btnWA.classList.remove('hidden'); }
    else { btnWA.classList.add('hidden'); }
    document.getElementById('btn-recibo-renta').classList.toggle('hidden', !tel);
    const saldo = parseFloat(r.saldo_pendiente) || 0;
    const esActiva = r.estatus_renta === 'Activa';
    document.getElementById('renta-badge-status').classList.toggle('hidden', r.estatus_renta !== 'Finalizada');
    document.getElementById('btn-cobrar').classList.toggle('hidden', saldo <= 0 || !esActiva);
    document.getElementById('btn-finalizar').classList.toggle('hidden', saldo > 0 || !esActiva);
    document.getElementById('btn-cancelar').classList.toggle('hidden', !esActiva);
    document.getElementById('modal-renta-detalle').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function cerrarModalRenta() {
    document.getElementById('modal-renta-detalle').classList.add('hidden');
    document.body.style.overflow = '';
    rentaEditing = null;
}
async function guardarEstadoRenta(nuevoEstado) {
    if (!rentaEditing) return;
    const idArticulo = rentaEditing.id_articulo;
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    cerrarModalRenta();
    await sb.from('inventario').update({ estado_actual: nuevoEstado }).eq('id_articulo', idArticulo);
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    Swal.fire({ icon:'success', title:'Vestido → ' + nuevoEstado, timer:1000, showConfirmButton:false });
}

async function cancelarRentaJS() {
    if (!rentaEditing) return;
    const r = { ...rentaEditing };
    const abono = parseFloat(r.abono) || 0;

    const opcs = {
        title: '¿Cancelar esta renta?',
        icon: 'warning',
        showCancelButton: true,
        cancelButtonText: 'No, conservar',
        cancelButtonColor: '#9ca3af',
        reverseButtons: true,
    };
    if (abono > 0) {
        opcs.html = `El cliente dejó un abono de <b>$${abono.toFixed(0)}</b>.<br><br>¿Qué hacemos con ese dinero?`;
        opcs.showDenyButton = true;
        opcs.confirmButtonText = 'Sin devolución';
        opcs.confirmButtonColor = '#ef4444';
        opcs.denyButtonText = `Dar crédito a favor ($${abono.toFixed(0)})`;
        opcs.denyButtonColor = '#6366f1';
    } else {
        opcs.text = 'La renta se marcará como cancelada.';
        opcs.confirmButtonText = 'Sí, cancelar';
        opcs.confirmButtonColor = '#ef4444';
    }

    const result = await Swal.fire(opcs);
    if (!result.isConfirmed && !result.isDenied) return;

    Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

    await sb.from('rentas').update({ estatus_renta: 'Cancelada', saldo_pendiente: 0 }).eq('id_renta', r.id_renta);

    if (result.isDenied && abono > 0) {
        const credEntry = {
            id_renta: 'CRED-' + Date.now().toString(16).slice(-8).toUpperCase(),
            id_cliente: r.id_cliente, id_articulo: null, estatus_renta: 'Credito',
            abono, saldo_pendiente: 0, total_renta: abono, descuento: 0,
            fecha_evento: new Date().toISOString().split('T')[0],
            fecha_entrega: new Date().toISOString().split('T')[0],
            fecha_retorno: new Date().toISOString().split('T')[0],
            documento_garantia: '', ajustes: `Crédito por cancelación de renta ${r.id_renta}`
        };
        const { data: credData } = await sb.from('rentas').insert(credEntry).select().single();
        if (credData) datosGlobales.rentas.push(credData);
    }

    if (r.id_articulo && r.id_articulo !== 'CREDITO') {
        await sb.from('inventario').update({ estado_actual: 'Disponible' }).eq('id_articulo', r.id_articulo);
        const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === r.id_articulo);
        if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Disponible';
    }

    const iR = datosGlobales.rentas.findIndex(rr => rr.id_renta === r.id_renta);
    if (iR !== -1) { datosGlobales.rentas[iR].estatus_renta = 'Cancelada'; datosGlobales.rentas[iR].saldo_pendiente = 0; }

    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    renderizarInventario(datosGlobales.inventario);

    const msg = result.isDenied && abono > 0
        ? `Se generó un crédito de $${abono.toFixed(0)} a favor del cliente.`
        : 'La renta fue cancelada sin devolución.';
    Swal.fire({ icon: 'success', title: 'Renta cancelada', text: msg, timer: 2500, showConfirmButton: false });
}
async function cobrarDeudaJS() {
    if (!rentaEditing) return;
    Swal.fire({ title:'Registrando pago...', didOpen:()=>Swal.showLoading() });
    const { error } = await sb.from('rentas').update({ saldo_pendiente:0, abono: rentaEditing.total_renta }).eq('id_renta', rentaEditing.id_renta);
    if (error) { Swal.fire('Error','No se pudo registrar.','error'); return; }
    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) datosGlobales.rentas[idx].saldo_pendiente = 0;
    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon:'success', title:'¡Pago registrado!', timer:1200, showConfirmButton:false });
}
async function finalizarRentaJS() {
    if (!rentaEditing) return;
    Swal.fire({ title:'Finalizando renta...', didOpen:()=>Swal.showLoading() });
    const ops = [sb.from('rentas').update({ estatus_renta:'Finalizada' }).eq('id_renta', rentaEditing.id_renta)];
    if (rentaEditing.id_articulo) ops.push(sb.from('inventario').update({ estado_actual:'Limpieza' }).eq('id_articulo', rentaEditing.id_articulo));
    await Promise.all(ops);
    const iR = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (iR !== -1) datosGlobales.rentas[iR].estatus_renta = 'Finalizada';
    const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === rentaEditing.id_articulo);
    if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Limpieza';
    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon:'success', title:'¡Renta finalizada!', text:'Vestido enviado a limpieza.', timer:1500, showConfirmButton:false });
}
function toggleEditarAjustes() {
    const vista   = document.getElementById('renta-modal-ajustes');
    const editor  = document.getElementById('ajustes-edit-section');
    const btn     = document.getElementById('btn-editar-ajustes');
    const editing = !editor.classList.contains('hidden');
    if (editing) {
        editor.classList.add('hidden');
        vista.classList.remove('hidden');
        btn.textContent = 'Editar';
    } else {
        document.getElementById('ajustes-textarea').value = rentaEditing?.ajustes || '';
        editor.classList.remove('hidden');
        vista.classList.add('hidden');
        btn.textContent = 'Cancelar';
        document.getElementById('ajustes-textarea').focus();
    }
}

async function guardarAjustesRenta() {
    if (!rentaEditing) return;
    const ajustes = document.getElementById('ajustes-textarea').value.trim();
    const { error } = await sb.from('rentas').update({ ajustes }).eq('id_renta', rentaEditing.id_renta);
    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }
    rentaEditing.ajustes = ajustes;
    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) datosGlobales.rentas[idx].ajustes = ajustes;
    document.getElementById('renta-modal-ajustes').textContent = ajustes || 'Sin ajustes registrados.';
    document.getElementById('ajustes-edit-section').classList.add('hidden');
    document.getElementById('renta-modal-ajustes').classList.remove('hidden');
    document.getElementById('btn-editar-ajustes').textContent = 'Editar';
    Swal.fire({ icon: 'success', title: '¡Ajustes guardados!', timer: 900, showConfirmButton: false });
}

function enviarReciboWhatsApp() {
    if (!rentaEditing) return;
    const r       = rentaEditing;
    const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
    const tel     = (cliente?.telefono || '').replace(/\D/g, '');
    if (!tel) { Swal.fire('Sin teléfono', 'El cliente no tiene teléfono registrado.', 'warning'); return; }
    const num     = tel.length === 10 ? '52' + tel : tel;
    const total   = parseFloat(r.total_renta) || 0;
    const abono   = parseFloat(r.abono) || 0;
    const saldo   = parseFloat(r.saldo_pendiente) || 0;
    const lineas  = [
        `🧾 *RECIBO DE RENTA — ALS DRESS*`,
        ``,
        `👤 ${cliente?.nombre_completo || r.id_cliente}`,
        `👗 ${nombreArticulo(r.id_articulo)}`,
        `🔢 Folio: ${r.id_renta}`,
        ``,
        `📅 Evento: ${r.fecha_evento || '—'}`,
        `📤 Entrega: ${r.fecha_entrega || '—'}`,
        `📥 Devolución: ${r.fecha_retorno || '—'}`,
        ``,
        `💰 Total: $${total.toFixed(0)}`,
        `✅ Abonado: $${abono.toFixed(0)}`,
        `${saldo > 0 ? '⚠️' : '✅'} Saldo: $${saldo.toFixed(0)}`,
    ];
    if (r.ajustes) lineas.push(``, `✂️ Ajustes: ${r.ajustes}`);
    if (r.documento_garantia) lineas.push(`📌 Garantía: ${r.documento_garantia}`);
    lineas.push(``, `¡Gracias por confiar en Als Dress! 💕`);
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(lineas.join('\n')), '_blank');
}

function enviarRecordatorioWhatsApp(cliente, renta, vestido) {
    const tel = (cliente.telefono||'').replace(/\D/g,'');
    const num = tel.length === 10 ? '52'+tel : tel;
    const msg = `Hola ${cliente.nombre_completo} 👋\n\nTe recordamos que el vestido *${vestido?.nombre||''}* debe devolverse el *${renta.fecha_retorno}*.\n\nSaldo pendiente: *$${parseFloat(renta.saldo_pendiente||0).toFixed(2)}*\n\n¡Gracias por confiar en Als Dress! 💕`;
    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
}

function renderizarClientes() {
    const contenedor = document.getElementById('lista-clientes');
    if (!contenedor) return;
    if (!datosGlobales.clientes.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No hay clientes registrados.</p>';
        return;
    }
    contenedor.innerHTML = '';
    datosGlobales.clientes.forEach(c => {
        const rentas  = datosGlobales.rentas.filter(r => r.id_cliente === c.id_cliente);
        const inicial = (c.nombre_completo||'?')[0].toUpperCase();
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<div class="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center text-pink-600 font-bold text-xl border border-pink-100 flex-shrink-0">${inicial}</div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm">${c.nombre_completo}</p>
                <p class="text-[10px] text-gray-400 mt-0.5 font-mono">${c.id_cliente}</p>
            </div>
            <span class="text-[10px] bg-pink-50 text-pink-600 px-2.5 py-1 rounded-full font-bold border border-pink-100 flex-shrink-0">${rentas.length} rentas</span>`;
        card.onclick = () => abrirHistorialCliente(c);
        contenedor.appendChild(card);
    });
}

function abrirHistorialCliente(cliente) {
    const rentas  = datosGlobales.rentas.filter(r => r.id_cliente === cliente.id_cliente);
    const inicial = (cliente.nombre_completo||'?')[0].toUpperCase();
    document.getElementById('cliente-modal-avatar').textContent = inicial;
    document.getElementById('cliente-modal-nombre').textContent = cliente.nombre_completo;
    document.getElementById('cliente-modal-id').textContent     = cliente.id_cliente;
    const rentasReales = rentas.filter(r => r.estatus_renta !== 'Credito' && r.estatus_renta !== 'Credito Usado');
    document.getElementById('cliente-total-rentas').textContent = rentasReales.length + ' Rentas';
    const credito = datosGlobales.rentas
        .filter(r => r.id_cliente === cliente.id_cliente && r.estatus_renta === 'Credito')
        .reduce((s, r) => s + (parseFloat(r.abono) || 0), 0);
    const creditoBadge = document.getElementById('cliente-credito-badge');
    if (credito > 0) { creditoBadge.textContent = '$' + credito.toFixed(0) + ' crédito'; creditoBadge.classList.remove('hidden'); }
    else { creditoBadge.classList.add('hidden'); }
    const tel  = (cliente.telefono||'').replace(/\D/g,'');
    const waEl = document.getElementById('cliente-modal-whatsapp');
    if (tel) { waEl.href = 'https://wa.me/'+(tel.length===10?'52'+tel:tel); waEl.classList.remove('hidden'); }
    else { waEl.classList.add('hidden'); }
    const lista = document.getElementById('lista-historial-cliente');
    lista.innerHTML = '';
    if (!rentas.length) {
        lista.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-6">Sin rentas registradas.</p>';
    } else {
        rentas.forEach(r => {
            const saldo = parseFloat(r.saldo_pendiente) || 0;
            const estadoColor = r.estatus_renta === 'Finalizada' ? 'bg-green-100 text-green-700'
                : r.estatus_renta === 'Cancelada' ? 'bg-red-100 text-red-600'
                : r.estatus_renta === 'Credito'   ? 'bg-indigo-100 text-indigo-700'
                : 'bg-blue-100 text-blue-700';
            const div = document.createElement('div');
            div.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-100';
            div.innerHTML = `<div class="flex justify-between items-start">
                <div><p class="font-bold text-sm text-gray-800">${nombreArticulo(r)}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Evento: ${r.fecha_evento||'—'}</p></div>
                <span class="text-xs font-black ${saldo>0?'text-red-500':'text-green-600'}">$${saldo.toFixed(0)}</span></div>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${estadoColor}">${r.estatus_renta}</span>`;
            lista.appendChild(div);
        });
    }
    document.getElementById('modal-cliente-historial').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function renderizarCalendario() {
    const el = document.getElementById('calendar');
    if (!el) return;
    if (calendarInst) { calendarInst.destroy(); calendarInst = null; }
    const eventos = [];
    datosGlobales.rentas.filter(r => r.estatus_renta === 'Activa').forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const nombre  = cliente?.nombre_completo || r.id_cliente;
        if (r.fecha_entrega) eventos.push({ title:'📤 '+nombre, date:r.fecha_entrega, backgroundColor:'#d63384', borderColor:'#d63384' });
        if (r.fecha_retorno) eventos.push({ title:'📥 '+nombre, date:r.fecha_retorno, backgroundColor:'#6b7280', borderColor:'#6b7280' });
    });
    calendarInst = new FullCalendar.Calendar(el, {
        initialView:'dayGridMonth', locale:'es',
        headerToolbar:{ left:'prev', center:'title', right:'next' },
        events:eventos, height:'auto',
        eventClick: (info) => Swal.fire({ title:info.event.title, text:info.event.startStr, icon:'info', confirmButtonColor:'#d63384' })
    });
    calendarInst.render();
}

function renderizarDashboard() {
    const rentas = datosGlobales.rentas;
    const totalIngresos = rentas.reduce((s,r) => s+(parseFloat(r.abono)||0),0);
    const totalDeuda    = rentas.filter(r=>r.estatus_renta==='Activa').reduce((s,r) => s+(parseFloat(r.saldo_pendiente)||0),0);
    const vendidos      = datosGlobales.inventario.filter(i => i.estado_actual === 'Vendido');
    const totalVentas   = vendidos.reduce((s,i) => s+(parseFloat(i.precio_venta)||0),0);
    document.getElementById('kpi-ingresos').textContent  = '$'+totalIngresos.toLocaleString('es-MX');
    document.getElementById('kpi-deuda').textContent     = '$'+totalDeuda.toLocaleString('es-MX');
    document.getElementById('kpi-ventas').textContent    = '$'+totalVentas.toLocaleString('es-MX');
    document.getElementById('kpi-vendidos').textContent  = vendidos.length + ' vendido' + (vendidos.length !== 1 ? 's' : '');
    const porMes = {};
    rentas.forEach(r => { if (!r.fecha_entrega) return; const m = r.fecha_entrega.substring(0,7); porMes[m]=(porMes[m]||0)+(parseFloat(r.abono)||0); });
    const meses  = Object.keys(porMes).sort().slice(-6);
    const labels = meses.map(m => { const [y,mo]=m.split('-'); return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1]+' '+y.slice(2); });
    const ctxM = document.getElementById('chart-mensual');
    if (ctxM) { if (ctxM._ci) ctxM._ci.destroy(); ctxM._ci = new Chart(ctxM,{ type:'bar', data:{ labels, datasets:[{ label:'Ingresos', data:meses.map(m=>porMes[m]||0), backgroundColor:'#d63384', borderRadius:8 }] }, options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } }); }
    const estados = { Disponible:0, Rentado:0, Limpieza:0 };
    datosGlobales.inventario.forEach(i => { if (estados[i.estado_actual]!==undefined) estados[i.estado_actual]++; });
    const ctxE = document.getElementById('chart-estados');
    if (ctxE) { if (ctxE._ci) ctxE._ci.destroy(); ctxE._ci = new Chart(ctxE,{ type:'doughnut', data:{ labels:['Disponible','Rentado','Limpieza'], datasets:[{ data:[estados.Disponible,estados.Rentado,estados.Limpieza], backgroundColor:['#22c55e','#3b82f6','#eab308'], borderWidth:0 }] }, options:{ plugins:{legend:{position:'bottom'}}, cutout:'65%' } }); }
}


// ---- TALLA DINÁMICA EN EDICIÓN ----
function actualizarTallaEdicion() {
    const tipo      = document.getElementById('edit-tipo').value;
    const select    = document.getElementById('edit-talla');
    const contenedor = document.getElementById('edit-contenedor-talla');
    select.innerHTML = '';
    if (tipo === 'Vestido') {
        contenedor.style.display = 'block';
        ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'].forEach(t => {
            const o = document.createElement('option'); o.value = t; o.text = t; select.add(o);
        });
    } else if (tipo === 'Zapato') {
        contenedor.style.display = 'block';
        for (let i = 2; i <= 7; i += 0.5) {
            const o = document.createElement('option'); o.value = String(i); o.text = i + ' MX'; select.add(o);
        }
    } else {
        contenedor.style.display = 'none';
        const o = document.createElement('option'); o.value = 'UNI'; o.text = 'Única'; select.add(o);
    }
}

// ---- TABS DEL MODAL ----
function cambiarTabModal(tab) {
    ['estado','editar','historial'].forEach(t => {
        document.getElementById('modal-content-' + t).classList.add('hidden');
        const btn = document.getElementById('modal-tab-' + t);
        btn.classList.remove('text-pink-600','border-pink-600');
        btn.classList.add('text-gray-400','border-transparent');
    });
    document.getElementById('modal-content-' + tab).classList.remove('hidden');
    const activeBtn = document.getElementById('modal-tab-' + tab);
    activeBtn.classList.add('text-pink-600','border-pink-600');
    activeBtn.classList.remove('text-gray-400','border-transparent');

    if (tab === 'historial') cargarHistorialVestido();
}

// ---- GUARDAR EDICIÓN ----
async function guardarEdicion() {
    if (!itemEditing) return;
    const item = { ...itemEditing };

    const nombre       = document.getElementById('edit-nombre').value.trim();
    const precio       = parseFloat(document.getElementById('edit-precio').value) || null;
    const talla        = document.getElementById('edit-talla').value;
    const color        = document.getElementById('edit-color').value.trim();
    const tipo         = document.getElementById('edit-tipo').value;
    const precio_venta = parseFloat(document.getElementById('edit-precio-venta').value) || null;

    if (!nombre) return Swal.fire('Falta el nombre', 'El nombre no puede estar vacío.', 'warning');

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

    const { error } = await sb.from('inventario').update({
        nombre, precio_base: precio, talla, color, tipo, precio_venta
    }).eq('id_articulo', item.id_articulo);

    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }

    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === item.id_articulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].nombre       = nombre;
        datosGlobales.inventario[idx].precio_base  = precio;
        datosGlobales.inventario[idx].talla        = talla;
        datosGlobales.inventario[idx].color        = color;
        datosGlobales.inventario[idx].tipo         = tipo;
        datosGlobales.inventario[idx].precio_venta = precio_venta;
    }

    cerrarModal();
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon: 'success', title: '¡Guardado!', timer: 1000, showConfirmButton: false });
}

// ---- VENDER VESTIDO ----
async function venderVestido() {
    if (!itemEditing) return;
    const item = { ...itemEditing };

    const confirm = await Swal.fire({
        title: '¿Marcar como Vendido?',
        text: 'El vestido se ocultará del inventario y del catálogo público.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Sí, vendido',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    const { error } = await sb.from('inventario').update({
        estado_actual: 'Vendido',
        publicado: false
    }).eq('id_articulo', item.id_articulo);

    if (error) { Swal.fire('Error', 'No se pudo actualizar.', 'error'); return; }

    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === item.id_articulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].estado_actual = 'Vendido';
        datosGlobales.inventario[idx].publicado     = false;
    }

    cerrarModal();
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon: 'success', title: '¡Vestido vendido!', text: 'Ya no aparece en el inventario activo.', timer: 1500, showConfirmButton: false });
}

// ---- HISTORIAL DEL VESTIDO ----
function cargarHistorialVestido() {
    if (!itemEditing) return;
    const rentas  = datosGlobales.rentas.filter(r => r.id_articulo === itemEditing.id_articulo);
    const lista   = document.getElementById('modal-lista-historial');
    const total   = document.getElementById('modal-total-rentas');
    if (!lista) return;

    total.textContent = rentas.length + ' rentas';
    lista.innerHTML   = '';

    if (!rentas.length) {
        lista.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-6">Sin rentas registradas.</p>';
        return;
    }

    rentas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const saldo   = parseFloat(r.saldo_pendiente) || 0;
        const estadoColor = r.estatus_renta === 'Finalizada' ? 'bg-green-100 text-green-700'
            : r.estatus_renta === 'Cancelada' ? 'bg-red-100 text-red-600'
            : 'bg-blue-100 text-blue-700';
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-100';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-sm text-gray-800">${cliente?.nombre_completo || r.id_cliente}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">Evento: ${r.fecha_evento || '—'}</p>
                </div>
                <span class="text-xs font-black ${saldo > 0 ? 'text-red-500' : 'text-green-600'}">$${saldo.toFixed(0)}</span>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${estadoColor}">
                ${r.estatus_renta}
            </span>`;
        lista.appendChild(div);
    });
}

async function cerrarSesion() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
}