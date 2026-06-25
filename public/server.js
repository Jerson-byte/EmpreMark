const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// REQUISITO: Guardar imágenes en una carpeta del servidor
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const app = express();

app.use(express.json());
app.use(express.static('public')); 
app.use('/uploads', express.static('uploads')); 

// REQUISITO: Sesiones -> Quién ha iniciado sesión
app.use(session({
    secret: 'clave_secreta_proyecto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// CONEXIÓN A LA BASE DE DATOS (Lista para la nube)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/empremark';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ Error de MongoDB:', err));

// --- REQUISITO: MODELOS COMPLETOS ---

// Usuarios → nombre de usuario, contraseña, empresa, teléfono, descripción y logo.
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    esVendedor: { type: Boolean, default: false },
    empresa: { type: String, default: "" },
    telefono: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    logo: { type: String, default: "" } // Solo guarda la ruta
}));

// Productos → nombre, precio, categoría, imagen y propietario.
const Product = mongoose.model('Product', new mongoose.Schema({
    nombre: String,
    precio: String,
    categoria: String,
    imagen: String, // REQUISITO: Solo guardar la ruta en la base de datos
    contacto: String,
    dueno: String // Propietario
}));

// --- RUTAS DE SESIONES Y USUARIOS ---

app.get('/api/session', async (req, res) => {
    if (!req.session.usuario) return res.json({ user: null });
    const userDB = await User.findOne({ user: req.session.usuario });
    res.json({ user: userDB });
});

app.post('/api/login', async (req, res) => {
    const { usuario, pass } = req.body;
    const userDB = await User.findOne({ user: usuario, pass });
    if (!userDB) return res.status(401).json({ error: 'Datos incorrectos' });
    req.session.usuario = userDB.user;
    res.json(userDB);
});

app.post('/api/register', async (req, res) => {
    const { usuario, pass } = req.body;
    try {
        const newUser = new User({ user: usuario, pass });
        await newUser.save();
        req.session.usuario = newUser.user;
        res.json(newUser);
    } catch (error) {
        res.status(400).json({ error: 'El usuario ya existe' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.put('/api/usuarios/me', upload.single('logo'), async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: 'No autorizado' });
    
    const updateData = {
        esVendedor: req.body.esVendedor === 'true',
        empresa: req.body.empresa,
        telefono: req.body.telefono,
        descripcion: req.body.descripcion
    };

    if (req.file) updateData.logo = '/uploads/' + req.file.filename;

    const updatedUser = await User.findOneAndUpdate({ user: req.session.usuario }, updateData, { new: true });
    res.json(updatedUser);
});

app.get('/api/usuarios/:user', async (req, res) => {
    const userDB = await User.findOne({ user: req.params.user }, '-pass');
    if (!userDB) return res.status(404).json({ error: 'No encontrado' });
    res.json(userDB);
});

// --- RUTAS DE PRODUCTOS ---

app.get('/api/productos', async (req, res) => {
    const productos = await Product.find().lean();
    const usuarios = await User.find({}, '-pass').lean();
    
    const productosConVendedor = productos.map(p => ({
        ...p,
        vendedorObj: usuarios.find(u => u.user === p.dueno) || {}
    }));
    res.json(productosConVendedor);
});

app.post('/api/productos', upload.single('imagen'), async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: 'No autorizado' });
    const userDB = await User.findOne({ user: req.session.usuario });
    
    const nuevo = new Product({
        nombre: req.body.nombre,
        precio: req.body.precio,
        categoria: req.body.categoria,
        contacto: userDB.telefono,
        dueno: req.session.usuario,
        imagen: '/uploads/' + req.file.filename
    });
    
    await nuevo.save();
    res.json(nuevo);
});

app.delete('/api/productos/:id', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: 'No autorizado' });
    await Product.findOneAndDelete({ _id: req.params.id, dueno: req.session.usuario });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
// --- RUTA DESPERTADOR PARA UPTIMEROBOT ---
app.get('/ping', (req, res) => {
    res.send('El servidor de EmpreMark está despierto ⏰');
});
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));