// =============================================
// agregar.js — Supabase
// =============================================

let fotoArchivo = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar sesión
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // Generar ID y código inicial
    generarID();
    cambiarOpcionesTalla();
});

// ---- Comprimir imagen con Canvas ----
function comprimirImagen(file, maxW = 1200, maxH = 1200, quality = 0.82) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > maxW || h > maxH) {
                    const ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => resolve(new File([blob], 'foto.jpg', { type: 'image/jpeg' })),
                    'image/jpeg',
                    quality
                );
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function formatearKB(bytes) {
    return bytes < 1024 * 1024
        ? (bytes / 1024).toFixed(0) + ' KB'
        : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- ID único ----
function generarID() {
    const id = Date.now().toString(16).slice(-8);
    document.getElementById('id').value = id;
}

// ---- Tallas dinámicas ----
function cambiarOpcionesTalla() {
    const tipo = document.getElementById('tipo').value;
    const select = document.getElementById('talla');
    const contenedor = document.getElementById('contenedor-talla');
    select.innerHTML = '';

    if (tipo === 'Vestido') {
        contenedor.style.display = 'block';
        ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.text = t;
            if (t === 'M') opt.selected = true;
            select.add(opt);
        });
    } else if (tipo === 'Zapato') {
        contenedor.style.display = 'block';
        for (let i = 2; i <= 7; i += 0.5) {
            const opt = document.createElement('option');
            opt.value = i.toString(); opt.text = i + ' MX';
            if (i === 4) opt.selected = true;
            select.add(opt);
        }
    } else {
        contenedor.style.display = 'none';
        const opt = document.createElement('option');
        opt.value = 'UNI'; opt.selected = true;
        select.add(opt);
    }
    actualizarCodigo();
}

function actualizarCodigo() {
    const talla  = document.getElementById('talla').value;
    const suffix = Math.random().toString(36).substr(2, 4).toUpperCase();
    document.getElementById('codigo').value = `${talla}-${suffix}`;
}

document.getElementById('tipo').addEventListener('change', cambiarOpcionesTalla);
document.getElementById('talla').addEventListener('change', actualizarCodigo);

// ---- Preview + compresión de foto ----
document.getElementById('input-foto').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;

    const originalSize = file.size;

    // Mostrar estado de compresión
    const placeholder = document.getElementById('preview-placeholder');
    placeholder.innerHTML = `
        <div class="text-center select-none">
            <div class="w-16 h-16 bg-pink-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span class="material-icons-round text-3xl text-pink-400 animate-spin">sync</span>
            </div>
            <p class="text-gray-500 text-sm font-bold">Comprimiendo...</p>
        </div>`;
    placeholder.classList.remove('hidden');
    document.getElementById('preview-img').classList.add('hidden');

    fotoArchivo = await comprimirImagen(file);

    const compressedSize = fotoArchivo.size;
    const saving = Math.round((1 - compressedSize / originalSize) * 100);

    // Mostrar preview con la imagen comprimida
    const url = URL.createObjectURL(fotoArchivo);
    const img = document.getElementById('preview-img');
    img.src = url;
    img.classList.remove('hidden');

    // Mostrar info de compresión sobre el preview
    placeholder.innerHTML = `
        <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5">
            <span class="text-white text-[10px] font-bold flex items-center gap-1">
                <span class="material-icons-round text-green-400" style="font-size:12px">check_circle</span>
                ${formatearKB(compressedSize)}
            </span>
            ${saving > 5 ? `<span class="text-green-400 text-[10px] font-bold">−${saving}%</span>` : ''}
        </div>`;
    placeholder.classList.remove('hidden');
    document.getElementById('zona-foto').classList.add('tiene-foto');
});

// ---- Enviar formulario ----
document.getElementById('form-agregar').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!fotoArchivo) {
        Swal.fire('Falta la foto', 'La fotografía es obligatoria.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-guardar');
    btn.innerHTML = '<span class="material-icons-round animate-spin text-lg">sync</span> Subiendo...';
    btn.disabled = true;

    try {
        const formData = new FormData(document.getElementById('form-agregar'));
        const datos    = Object.fromEntries(formData);
        const idArt    = datos.id;

        // 1. Subir foto comprimida (siempre .jpg)
        const rutaFoto = `inventario/${idArt}.jpg`;

        const { error: storageError } = await sb.storage
            .from('fotos')
            .upload(rutaFoto, fotoArchivo, { upsert: true, contentType: 'image/jpeg' });

        if (storageError) throw storageError;

        // 2. Obtener URL pública de la foto
        const { data: urlData } = sb.storage.from('fotos').getPublicUrl(rutaFoto);
        const fotoUrl = urlData.publicUrl;

        // 3. Insertar en la tabla inventario
        const { error: dbError } = await sb.from('inventario').insert({
            id_articulo:   idArt,
            tipo:          datos.tipo,
            precio_base:   parseFloat(datos.precio) || null,
            precio_venta:  parseFloat(datos.precio_venta) || null,
            talla:         datos.talla,
            color:         datos.color || '',
            estado_actual: 'Disponible',
            foto:          fotoUrl,
            codigo:        datos.codigo,
            nombre:        datos.nombre,
            publicado:     false
        });

        if (dbError) throw dbError;

        Swal.fire({
            icon: 'success',
            title: '¡Artículo guardado!',
            text: 'Se agregó correctamente al inventario.',
            showConfirmButton: false,
            timer: 1500
        }).then(() => { window.location.href = 'admin.html'; });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar: ' + (err.message || err), 'error');
        btn.innerHTML = '<span class="material-icons-round text-lg">cloud_upload</span> Guardar en Inventario';
        btn.disabled = false;
    }
});