// admin.js - VERSIÓN FINAL CORREGIDA (CSV Blindado + Gráficas Estables + Historial Clientes PRO)
// VERIFICACIÓN DE SESIÓN (Poner al inicio del archivo)
if (localStorage.getItem('als_sesion') !== 'activa') {
    window.location.href = 'index.html';
}

function cerrarSesion() {
    localStorage.removeItem('als_sesion');
    window.location.href = 'login.html';
}
const urlInvCSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTq9BmfWGt_CwpP-JSii1fx3BqkNvIvYpf_WJTxpDUR4xF_L6mKWjnF0W7OpoKZX9Q4smw74417ojPu/pub?gid=0&single=true&output=csv'; 
const urlRentasCSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTq9BmfWGt_CwpP-JSii1fx3BqkNvIvYpf_WJTxpDUR4xF_L6mKWjnF0W7OpoKZX9Q4smw74417ojPu/pub?gid=943939595&single=true&output=csv'; 
const urlClientesCSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTq9BmfWGt_CwpP-JSii1fx3BqkNvIvYpf_WJTxpDUR4xF_L6mKWjnF0W7OpoKZX9Q4smw74417ojPu/pub?gid=1168052197&single=true&output=csv';

const urlAPI = "https://script.google.com/macros/s/AKfycbygpPY8FKKFN_5OT0An4cESl_YDzPWVBYadKHbdU9jTRtL1lkRV3N-7WlCudfxqJDc_/exec";
const appName = "RentaVestidosAPP-250346467"; 
const tableName = "Inventario"; 

let datosGlobales = { inventario: [], rentas: [], clientes: [] };
let calendarInstance = null;

// VARIABLES GLOBALES PARA LAS GRÁFICAS
let chartMensual = null;
let chartEstados = null;


// --- 🛠️ HERRAMIENTA UNIVERSAL DE DINERO (Movida a Global para que todos la usen) ---
const limpiarDinero = (valor) => {
    if (!valor) return 0;
    return parseFloat(valor.toString().replace(/[^\d.-]/g, '')) || 0;
};

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    cargarTodo();
    document.getElementById('buscador').addEventListener('input', (e) => filtrarContenido(e.target.value));
});

// --- NAVEGACIÓN ---
function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('nav button').forEach(el => {
        el.classList.remove('active', 'border-pink-600', 'text-pink-600');
        el.classList.add('text-gray-400', 'border-transparent');
    });

    const seccion = document.getElementById(`sec-${tab}`);
    const boton   = document.getElementById(`btn-tab-${tab}`);

    if (seccion && boton) {
        seccion.classList.remove('hidden');
        boton.classList.add('active', 'border-pink-600', 'text-pink-600');
        boton.classList.remove('text-gray-400', 'border-transparent');

        if (tab === 'clientes')   renderizarClientes();
        if (tab === 'rentas')     renderizarRentas(datosGlobales.rentas);
        if (tab === 'historial')  renderizarHistorial(datosGlobales.rentas);
        if (tab === 'finanzas')   renderizarDashboard();
        if (tab === 'calendario') setTimeout(() => renderizarCalendario(), 150);
    }
}

async function cargarTodo() {
    try {
        const timestamp = Date.now(); 
        const [invResp, rentResp, cliResp] = await Promise.all([
            fetch(urlInvCSV + "&t=" + timestamp), 
            fetch(urlRentasCSV + "&t=" + timestamp), 
            fetch(urlClientesCSV + "&t=" + timestamp)
        ]);
        const [invTxt, rentTxt, cliTxt] = await Promise.all([
            invResp.text(), rentResp.text(), cliResp.text()
        ]);

        datosGlobales.inventario = csvAJSON(invTxt);
        datosGlobales.rentas = csvAJSON(rentTxt);
        datosGlobales.clientes = csvAJSON(cliTxt);

        renderizarInventario(datosGlobales.inventario);
        console.log("✅ Datos Cargados (CSV Blindado)");
    } catch (e) { console.error("Error cargando datos:", e); }
}

// --- PARSER CSV MEJORADO ---
function csvAJSON(csv) {
    const lineas = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lineas.length < 1) return [];

    let filaHeaders = 0;
    for(let i = 0; i < lineas.length; i++) { 
        if(lineas[i].toUpperCase().includes("ID")) { filaHeaders = i; break; } 
    }
    
    const splitCSV = (str) => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '"') { inQuote = !inQuote; }
            else if (char === ',' && !inQuote) {
                result.push(current.trim());
                current = '';
            } else { current += char; }
        }
        result.push(current.trim());
        return result;
    };

    const headers = splitCSV(lineas[filaHeaders]).map(h => h.replace(/^"|"$/g, ''));
    const result = [];
    
    for (let i = filaHeaders + 1; i < lineas.length; i++) {
        const datos = splitCSV(lineas[i]);
        const obj = {};
        headers.forEach((h, idx) => { 
            let valor = datos[idx] || '';
            valor = valor.replace(/^"|"$/g, ''); 
            obj[h] = valor; 
        });
        result.push(obj);
    }
    return result;
}

// --- RENDERIZADO INVENTARIO (VERSIÓN DETECTIVE) ---
function renderizarInventario(lista) {
    const contenedor = document.getElementById('lista-admin');
    if(!contenedor) return;
    contenedor.innerHTML = '';
    
    lista.forEach(item => {
        const nombre = item['Nombre'] || item['Nombre_Completo'] || "Sin Nombre";
        const id = item['ID_Articulo'] || "N/A";
        const talla = item['Talla'] || "S/T";
        
        // --- BUSCADOR INTELIGENTE DE PRECIO ---
        let precioRaw = 0;
        for (let clave in item) {
            if (clave.toLowerCase().includes('precio')) {
                precioRaw = item[clave];
                break;
            }
        }
        const precio = limpiarDinero(precioRaw); 

        const fotoRaw = item['Foto'] || "";
        let urlFoto = fotoRaw.startsWith('http') ? fotoRaw : `https://www.appsheet.com/template/gettablefileurl?appName=${appName}&tableName=${tableName}&fileName=${encodeURIComponent(fotoRaw)}`;
        
        let estado = (item['Estado_Actual'] || 'Disponible').trim();
        let colorB = estado === 'Disponible' ? 'bg-green-100 text-green-700' : (estado === 'Rentado' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700');

        contenedor.innerHTML += `
            <div onclick="abrirModalInventario('${id}', '${nombre}', '${estado}')" 
                 class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 mb-2 transition-all cursor-pointer">
                
                <div class="flex items-center gap-3">
                    <img src="${urlFoto}" class="h-14 w-12 rounded-lg object-cover bg-gray-100" onerror="this.src='https://placehold.co/100x120?text=👗'">
                    <div>
                        <h3 class="font-bold text-sm text-gray-800 leading-tight">${nombre}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[9px] bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded font-black border border-pink-100">TALLA ${talla}</span>
                            <span class="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-black border border-green-100">$${precio.toLocaleString('es-MX')}</span>
                            <p class="text-[9px] text-gray-400 font-mono">${id}</p>
                        </div>
                    </div>
                </div>

                <span class="px-2 py-1 rounded-full text-[9px] font-black border ${colorB}">${estado.toUpperCase()}</span>
            </div>`;
    });
}
function renderizarRentas(lista) {
    const contenedor = document.getElementById('lista-rentas');
    if(!contenedor) return;
    contenedor.innerHTML = '';
    const activas = lista.filter(r => r['Estatus_Renta'] === 'Activa');
    if(activas.length === 0) { contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm">No hay rentas en curso.</p>'; return; }
    activas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === r['ID_Cliente']);
        const nombreCliente = cliente ? (cliente['Nombre'] || cliente['Nombre_Completo']) : r['ID_Cliente'];
        const vestidoRenta = datosGlobales.inventario.find(i => i['ID_Articulo'] === r['ID_Articulo']);
        const nombreVestido = vestidoRenta ? vestidoRenta['Nombre'] : (r['ID_Articulo'] || "Vestido");
        const saldo = limpiarDinero(r['Saldo_Pendiente']);
        const colorSaldo = saldo > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700';
        contenedor.innerHTML += `
            <div onclick="abrirModalRenta('${r['ID_Renta']}')" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-3 active:scale-[0.98] transition-all cursor-pointer">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-900 text-sm">${nombreCliente}</h3>
                    <span class="text-[9px] font-black px-2 py-1 rounded-lg ${colorSaldo}">${saldo > 0 ? 'DEUDA: $' + saldo : 'LIQUIDADO'}</span>
                </div>
                <div class="text-[11px] text-gray-600"><p>👗 <b>Vestido:</b> ${nombreVestido}</p><p>📅 <b>Retorno:</b> ${r['Fecha_Retorno']}</p></div>
            </div>`;
    });
}

function renderizarHistorial(lista) {
    const contenedor = document.getElementById('lista-historial');
    if(!contenedor) return;
    contenedor.innerHTML = '';
    const cerradas = lista.filter(r => r['Estatus_Renta'] !== 'Activa');
    if(cerradas.length === 0) { contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm">Historial vacío.</p>'; return; }
    cerradas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === r['ID_Cliente']);
        const nombreCliente = cliente ? (cliente['Nombre'] || cliente['Nombre_Completo']) : r['ID_Cliente'];
        contenedor.innerHTML += `
            <div onclick="abrirModalRenta('${r['ID_Renta']}')" class="bg-gray-50 p-4 rounded-2xl border border-gray-200 mb-3 cursor-pointer opacity-80 hover:opacity-100">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-600 text-sm">${nombreCliente}</h3>
                    <span class="text-[9px] bg-gray-200 text-gray-500 px-2 py-1 rounded-lg font-bold">CERRADA</span>
                </div>
                <div class="text-[11px] text-gray-500"><p>🆔 Renta: ${r['ID_Renta']}</p><p>🏁 ${r['Fecha_Retorno']}</p></div>
            </div>`;
    });
}

// --- RENDER CLIENTES ---
function renderizarClientes() {
    const contenedor = document.getElementById('lista-clientes');
    if(!contenedor) return;
    contenedor.innerHTML = '';

    datosGlobales.clientes.forEach(c => {
        const nombre = c['Nombre_Completo'] || c['Nombre'] || "Sin Nombre"; 
        const telefono = c['Telefono'] || "Sin Tel";
        const id = c['ID_Cliente'] || "C-000";
        const historial = datosGlobales.rentas.filter(r => r['ID_Cliente'] === id);
        const numRentas = historial.length;
        
        let badgeColor = "bg-gray-100 text-gray-600";
        if(numRentas >= 3) badgeColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
        if(numRentas >= 5) badgeColor = "bg-pink-100 text-pink-700 border-pink-200";

        contenedor.innerHTML += `
            <div onclick="abrirHistorialCliente('${id}')" 
                 class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between mb-3 cursor-pointer hover:bg-gray-50 active:scale-[0.98] transition-all">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 font-bold border border-pink-100 uppercase">
                        ${nombre.charAt(0)}
                    </div>
                    <div><h3 class="font-bold text-gray-800 text-sm">${nombre}</h3><p class="text-[10px] text-gray-500">📱 ${telefono}</p></div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="${badgeColor} text-[8px] px-2 py-0.5 rounded-full font-bold border">${numRentas} Rentas</span>
                    <span class="text-[9px] text-gray-400 flex items-center gap-1">Ver historial <span class="material-icons text-[10px]">chevron_right</span></span>
                </div>
            </div>`;
    });
}

// --- MODAL HISTORIAL DE CLIENTE (CORREGIDO) ---
function abrirHistorialCliente(idCliente) {
    const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === idCliente);
    if(!cliente) return;

    // Referencias a elementos del DOM
    const elNombre = document.getElementById('cliente-modal-nombre');
    const elAvatar = document.getElementById('cliente-modal-avatar');
    const elID = document.getElementById('cliente-modal-id');
    const elBtnWa = document.getElementById('cliente-modal-whatsapp');
    const elTotal = document.getElementById('cliente-total-rentas');
    const elLista = document.getElementById('lista-historial-cliente');
    const elModal = document.getElementById('modal-cliente-historial');

    // Validación de seguridad: Si falta algún elemento en el HTML, avisamos y no tronamos
    if (!elNombre || !elLista || !elModal) {
        console.error("❌ ERROR: Faltan elementos en el HTML (IDs cliente-modal-nombre o lista-historial-cliente)");
        return Swal.fire('Error de Interfaz', 'No se encontró el modal de historial en el HTML.', 'error');
    }

    const nombre = cliente['Nombre_Completo'] || cliente['Nombre'];
    const telefono = (cliente['Telefono'] || "").toString().replace(/\D/g, ''); 

    // Llenar datos básicos
    elNombre.innerText = nombre;
    if(elAvatar) elAvatar.innerText = nombre.charAt(0);
    if(elID) elID.innerText = `ID: ${idCliente}`;
    
    // Configurar WhatsApp
    if (elBtnWa) {
        if (telefono.length >= 10) {
            elBtnWa.href = `https://wa.me/${telefono}`;
            elBtnWa.classList.remove('hidden');
        } else {
            elBtnWa.classList.add('hidden');
        }
    }

    // Filtrar rentas del cliente
    const historial = datosGlobales.rentas.filter(r => r['ID_Cliente'] === idCliente).reverse();
    if(elTotal) elTotal.innerText = `${historial.length} Rentas Totales`;

    // Limpiar y llenar lista
    elLista.innerHTML = '';
    if (historial.length === 0) {
        elLista.innerHTML = '<div class="text-center py-6 text-gray-400 text-xs italic">Sin historial registrado.</div>';
    } else {
        historial.forEach(r => {
            let nombreVestido = "Vestido";
            const idArticulo = r['ID_Articulo'] || Object.values(r)[12];
            const vestidoEncontrado = datosGlobales.inventario.find(i => i['ID_Articulo'] === idArticulo);
            if(vestidoEncontrado) nombreVestido = vestidoEncontrado['Nombre'];

            const esActiva = r['Estatus_Renta'] === 'Activa';
            const estadoTexto = esActiva ? 'EN CURSO' : 'FINALIZADA';
            const estadoClase = esActiva ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500';
            
            // Usando tu función limpiarDinero para el saldo
            const saldo = limpiarDinero(r['Saldo_Pendiente']);
            const saldoHTML = saldo > 0 ? `<span class="text-red-600 font-bold">Debe: $${saldo}</span>` : `<span class="text-green-600 font-bold">Pagado</span>`;

            elLista.innerHTML += `
                <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 flex gap-3 items-start mb-2">
                    <span class="material-icons text-gray-300 mt-1">${esActiva ? 'timelapse' : 'check_circle'}</span>
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <h4 class="text-xs font-bold text-gray-800">👗 ${nombreVestido}</h4>
                            <span class="text-[8px] px-1.5 py-0.5 rounded font-bold ${estadoClase}">${estadoTexto}</span>
                        </div>
                        <div class="flex justify-between items-center mt-1">
                            <p class="text-[10px] text-gray-500">📅 ${r['Fecha_Retorno']}</p>
                            <p class="text-[10px]">${saldoHTML}</p>
                        </div>
                    </div>
                </div>`;
        });
    }

    elModal.classList.remove('hidden');
}

// --- DASHBOARD FINANCIERO ---
function renderizarDashboard() {
    let totalIngresos = 0;
    let deudaTotal = 0;
    let ingresosPorMes = {};

    datosGlobales.rentas.forEach(r => {
        if (!r['ID_Renta'] || r['Estatus_Renta'] === 'Cancelada') return;

        const monto = limpiarDinero(r['Total_Renta']);
        const saldo = limpiarDinero(r['Saldo_Pendiente']);
        const fechaRaw = r['Fecha_Evento']; 
        
        if (monto > 0) {
            totalIngresos += monto;
            deudaTotal += saldo;
            if(fechaRaw) {
                let mesKey = "";
                if (fechaRaw.includes('-')) {
                    mesKey = fechaRaw.substring(0, 7); 
                } else if (fechaRaw.includes('/')) {
                    const partes = fechaRaw.split('/');
                    if (partes.length === 3) mesKey = `${partes[2]}-${partes[1]}`;
                }
                if (mesKey) {
                    if(!ingresosPorMes[mesKey]) ingresosPorMes[mesKey] = 0;
                    ingresosPorMes[mesKey] += monto;
                }
            }
        }
    });

    document.getElementById('kpi-ingresos').innerText = "$" + totalIngresos.toLocaleString();
    document.getElementById('kpi-deuda').innerText = "$" + deudaTotal.toLocaleString();

    const mesesOrdenados = Object.keys(ingresosPorMes).sort();
    const dataMensual = mesesOrdenados.map(m => ingresosPorMes[m]);
    const labelsMensual = mesesOrdenados.map(m => {
        const [anio, mes] = m.split('-');
        const fechaObj = new Date(anio, mes - 1);
        return fechaObj.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    });

    let estados = { 'Disponible': 0, 'Rentado': 0, 'Limpieza': 0 };
    datosGlobales.inventario.forEach(i => {
        const est = (i['Estado_Actual'] || 'Disponible').trim();
        if(estados[est] !== undefined) estados[est]++;
    });

    if(chartMensual) chartMensual.destroy();
    if(chartEstados) chartEstados.destroy();

    const ctx1 = document.getElementById('chart-mensual').getContext('2d');
    chartMensual = new Chart(ctx1, {
        type: 'bar',
        data: { labels: labelsMensual, datasets: [{ label: 'Ventas ($)', data: dataMensual, backgroundColor: '#ec4899', borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    const ctx2 = document.getElementById('chart-estados').getContext('2d');
    chartEstados = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: ['Disponible', 'Rentado', 'Limpieza'], datasets: [{ data: [estados['Disponible'], estados['Rentado'], estados['Limpieza']], backgroundColor: ['#4ade80', '#60a5fa', '#facc15'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// --- MODAL DETALLE RENTA Y ACCIONES ---
function abrirModalRenta(idRenta) {
    const renta = datosGlobales.rentas.find(r => r['ID_Renta'] === idRenta);
    if(!renta) return;
    const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === renta['ID_Cliente']);
    document.getElementById('renta-modal-cliente').innerText = cliente ? (cliente['Nombre'] || cliente['Nombre_Completo']) : "Cliente";
    
    let idArticulo = renta['ID_Articulo'] || Object.values(renta)[12];
    let nombreVestido = r['ID_Articulo'] || "Vestido";
    let urlFoto = "";
    if (idArticulo) {
        const vestido = datosGlobales.inventario.find(i => i['ID_Articulo'] === idArticulo);
        if (vestido) {
            nombreVestido = vestido['Nombre'];
            const fotoRaw = vestido['Foto'] || "";
            urlFoto = fotoRaw.startsWith('http') ? fotoRaw : `https://www.appsheet.com/template/gettablefileurl?appName=${appName}&tableName=${tableName}&fileName=${encodeURIComponent(fotoRaw)}`;
        }
    }
    document.getElementById('renta-modal-vestido').innerText = nombreVestido;
    document.getElementById('renta-modal-id').innerText = idRenta;
    document.getElementById('renta-modal-ajustes').innerText = renta['Ajustes'] || "Sin ajustes.";
    document.getElementById('renta-modal-foto').src = urlFoto || 'https://placehold.co/100x120?text=Sin+Foto';
    document.getElementById('renta-modal-fecha-e').innerText = renta['Fecha_Entrega'] || "--";
    document.getElementById('renta-modal-fecha-r').innerText = renta['Fecha_Retorno'] || "--";
    
    const saldo = limpiarDinero(renta['Saldo_Pendiente']);
    document.getElementById('renta-modal-saldo').innerText = "$" + saldo;
    const zonaAcciones = document.getElementById('zona-acciones-renta');
    const badgeStatus = document.getElementById('renta-badge-status');
    const btnCobrar = document.getElementById('btn-cobrar');
    const btnFinalizar = document.getElementById('btn-finalizar');

    if (renta['Estatus_Renta'] !== 'Activa') {
        zonaAcciones.classList.add('hidden'); badgeStatus.classList.remove('hidden'); 
    } else {
        zonaAcciones.classList.remove('hidden'); badgeStatus.classList.add('hidden');
        if (saldo > 0) { btnCobrar.classList.remove('hidden'); btnFinalizar.classList.add('hidden'); } 
        else { btnCobrar.classList.add('hidden'); btnFinalizar.classList.remove('hidden'); }
    }
    const modal = document.getElementById('modal-renta-detalle');
    modal.dataset.idRenta = idRenta;
    modal.dataset.idArticulo = idArticulo || "";
    modal.classList.remove('hidden');
}

async function cobrarDeudaJS() {
    const idRenta = document.getElementById('modal-renta-detalle').dataset.idRenta;
    if(!confirm("¿Confirmar pago total?")) return;
    const btn = document.getElementById('btn-cobrar'); btn.innerText = "Procesando..."; btn.disabled = true;
    try { await fetch(`${urlAPI}?accion=liquidar_deuda&id=${idRenta}`, { method: "POST", mode: "no-cors" }); alert("✅ Pagado."); cerrarModalRenta(); location.reload(); } catch (e) { alert("Error"); btn.disabled = false; }
}

async function finalizarRentaJS() {
    const idRenta = document.getElementById('modal-renta-detalle').dataset.idRenta;
    const idArticulo = document.getElementById('modal-renta-detalle').dataset.idArticulo;
    if(!confirm("¿Recibir vestido y finalizar renta?")) return;
    const btn = document.getElementById('btn-finalizar'); btn.innerText = "Finalizando..."; btn.disabled = true;
    try { await fetch(`${urlAPI}?accion=finalizar_renta&id=${idRenta}`, { method: "POST", mode: "no-cors" }); if(idArticulo) await fetch(`${urlAPI}?accion=cambiar_estado&id=${idArticulo}&estado=Limpieza`, { method: "POST", mode: "no-cors" }); alert("✅ Cerrada."); cerrarModalRenta(); location.reload(); } catch (e) { alert("Error"); btn.disabled = false; }
}

async function guardarEstadoRenta(nuevoEstado) {
    const modal = document.getElementById('modal-renta-detalle');
    const idRenta = modal.dataset.idRenta; const idArticulo = modal.dataset.idArticulo;
    if(!idArticulo) return alert("Error ID Artículo");
    if(!confirm(`¿Cambiar estado a ${nuevoEstado}?`)) return;
    try { await fetch(`${urlAPI}?accion=cambiar_estado&id=${idArticulo}&estado=${nuevoEstado}`, { method: "POST", mode: "no-cors" }); if (idRenta && (nuevoEstado === 'Disponible' || nuevoEstado === 'Limpieza')) { await fetch(`${urlAPI}?accion=finalizar_renta&id=${idRenta}`, { method: "POST", mode: "no-cors" }); } alert("✅ Actualizado."); location.reload(); } catch (e) { alert("Error"); }
}

function cerrarModalRenta() { document.getElementById('modal-renta-detalle').classList.add('hidden'); }

function filtrarInventario(criterio) {
    if (!criterio) { 
        renderizarInventario(datosGlobales.inventario); 
        return; 
    }
    const filtrados = datosGlobales.inventario.filter(i => (i['Estado_Actual'] || '').trim() === criterio);
    renderizarInventario(filtrados);
}

function filtrarContenido(texto) {
    const t = texto.toLowerCase().trim();
    const filtrados = datosGlobales.inventario.filter(i => 
        (i['Nombre'] || '').toLowerCase().includes(t) || 
        (i['ID_Articulo'] || '').toLowerCase().includes(t)
    );
    renderizarInventario(filtrados);
}

// Modal Inventario Rápido
const modalInv = document.getElementById('modal-editar'); 
function abrirModalInventario(id, nombre, estado) { 
    document.getElementById('modal-titulo').innerText = nombre; 
    document.getElementById('modal-subtitulo').innerText = `ID: ${id}`; 
    modalInv.dataset.idActual = id; 
    
    // --- NUEVO: LEER ESTADO DE PUBLICACIÓN ---
    const vestido = datosGlobales.inventario.find(v => v['ID_Articulo'] === id);
    if (vestido) {
        // Si el Excel dice "SI", el switch se enciende. Si dice otra cosa o está vacío, se apaga.
        const estaPublicado = (vestido['Publicado'] || '').trim().toUpperCase() === 'SI';
        document.getElementById('toggle-publicado').checked = estaPublicado;
    }
    // -----------------------------------------

    modalInv.classList.remove('hidden'); 
}

function cerrarModal() { modalInv.classList.add('hidden'); } 

async function guardarEstado(nuevoEstado) { 
    const id = modalInv.dataset.idActual; 
    
    // 1. Definimos colores según el estado para darle estilo
    let colorBoton = '#22c55e'; // Verde para Disponible
    if (nuevoEstado === 'Limpieza') colorBoton = '#eab308'; // Amarillo
    if (nuevoEstado === 'Rentado') colorBoton = '#3b82f6';  // Azul

    // 2. Animación de Confirmación Elegante
    const confirmacion = await Swal.fire({
        title: `¿Mandar a ${nuevoEstado}?`,
        text: "El inventario se actualizará inmediatamente.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: colorBoton,
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true, // Pone el botón de cancelar a la izquierda (mejor UX)
        backdrop: `rgba(0,0,0,0.6)` // Fondo oscuro borroso
    });

    if (confirmacion.isConfirmed) { 
        // 3. Animación de "Cargando..."
        Swal.fire({
            title: 'Actualizando...',
            html: 'Conectando con la base de datos ⚙️',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading(); // Muestra la ruedita girando
            }
        });

        try {
            // 4. Disparamos la orden al servidor
            await fetch(`${urlAPI}?accion=cambiar_estado&id=${id}&estado=${nuevoEstado}`, { method: "POST", mode: "no-cors" }); 
            
            // 5. Animación de Éxito y recarga automática
            Swal.fire({
                title: '¡Listo!',
                text: `El vestido ahora está en ${nuevoEstado}.`,
                icon: 'success',
                timer: 1500, // Se cierra solo en 1.5 segundos
                showConfirmButton: false
            }).then(() => {
                cerrarModal();
                location.reload();
            });

        } catch (error) {
            Swal.fire('Error', 'Hubo un problema de conexión con el servidor.', 'error');
        }
    } 
}
// --- NUEVA FUNCIÓN: CAMBIAR VISIBILIDAD WEB ---
async function cambiarVisibilidadWeb(estaActivado) {
    const id = modalInv.dataset.idActual; 
    const nuevoEstado = estaActivado ? 'SI' : 'NO';

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
    });

    try {
        await fetch(`${urlAPI}?accion=cambiar_publicacion&id=${id}&estado=${nuevoEstado}`, { 
            method: "POST", 
            mode: "no-cors" 
        });

        Toast.fire({
            icon: 'success',
            title: nuevoEstado === 'SI' ? 'Visible en la web 🌐' : 'Oculto de la web 🚫'
        });

        // Actualizamos nuestro arreglo local para que no haya que recargar la página entera
        const vestido = datosGlobales.inventario.find(v => v['ID_Articulo'] === id);
        if(vestido) vestido['Publicado'] = nuevoEstado;

    } catch (error) {
        console.error("Error al actualizar visibilidad:", error);
        Swal.fire('Error', 'No se pudo actualizar en la nube. Revisa tu conexión.', 'error');
        // Revertir el switch si hubo error
        document.getElementById('toggle-publicado').checked = !estaActivado;
    }
}
// --- FUNCIÓN PARA EL CALENDARIO DE PUNTOS (CON CLIC A DETALLE) ---
function renderizarCalendario() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;

    const eventos = [];
    datosGlobales.rentas.forEach(r => {
        if(r['Estatus_Renta'] === 'Cancelada') return;
        
        const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === r['ID_Cliente']);
        const nombre = cliente ? (cliente['Nombre'] || 'Cliente') : 'Cliente';
        
        // 1. Punto de Salida (Rosa)
        if(r['Fecha_Entrega']) {
            eventos.push({
                title: `📤 OUT: ${nombre}`,
                start: r['Fecha_Entrega'],
                color: '#ec4899', 
                extendedProps: { idRenta: r['ID_Renta'] }
            });
        }
        
        // 2. Punto de Regreso (Gris)
        if(r['Fecha_Retorno']) {
            eventos.push({
                title: `📥 IN: ${nombre}`,
                start: r['Fecha_Retorno'],
                color: '#6b7280', 
                extendedProps: { idRenta: r['ID_Renta'] }
            });
        }
    });

    if(calendarInstance) calendarInstance.destroy();

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        height: 'auto',
        events: eventos,
        eventClick: (info) => {
            // AL DAR CLIC, SE ABRE TU MODAL CON TODA LA INFO:
            // Quien rentó, qué vestido, ajustes y saldo pendiente.
            abrirModalRenta(info.event.extendedProps.idRenta);
        }
    });
    calendarInstance.render();
}
// --- FUNCIÓN PARA ENVIAR RESUMEN POR WHATSAPP ---
function enviarTicketWhatsApp() {
    const modal = document.getElementById('modal-renta-detalle');
    const idRenta = modal.dataset.idRenta;
    const renta = datosGlobales.rentas.find(r => r['ID_Renta'] === idRenta);
    const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === renta['ID_Cliente']);
    
    if(!cliente || !cliente['Telefono']) return Swal.fire('Sin Teléfono', 'No hay un número registrado.', 'warning');

    const tel = cliente['Telefono'].toString().replace(/\D/g, '');
    const vestido = document.getElementById('renta-modal-vestido').innerText;
    const saldo = document.getElementById('renta-modal-saldo').innerText;
    const retorno = document.getElementById('renta-modal-fecha-r').innerText;

    const mensaje = `👋 Hola ${cliente['Nombre']}, recordatorio de tu renta en *ALS Rent*:\n👗 *Vestido:* ${vestido}\n📅 *Devolución:* ${retorno}\n💰 *Saldo:* ${saldo}\n\n¡Te esperamos! ✨`;
    
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}