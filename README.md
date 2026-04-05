# Savia Escolar 🍃 — Gestión Contable con Raíz y Propósito

Savia Escolar es una plataforma SaaS innovadora diseñada para transformar la manera en que los centros educativos, directivas de cursos y asociaciones de padres de familia administran sus eventos y recaudaciones de fondos de manera colaborativa y transparente.

<div align="center">
  <img src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" alt="Savia Escolar Banner" width="1000">
</div>

## 🎯 ¿Qué Problema Resolvemos?

La plataforma combate los cuellos de botella clásicos en la administración escolar:
* **Falta de Transparencia:** Los apoderados desconocen a menudo cómo se gestionan los fondos; Savia ofrece visibilidad integral.
* **Seguimiento de Morosidad:** Elimina el caos del seguimiento manual de deudas mediante un monitor de deudores críticos.
* **Reportes Desorganizados:** Sustituye excels y libretas por un panel centralizado con métricas en tiempo real.

## ✨ Funcionalidades Principales

* **Dashboard Inteligente 📊:** Visualización de métricas globales, total recaudado a la fecha y alertas de morosidad automatizadas.
* **Gestión Integral de Eventos 📅:** Creación de campañas con metas económicas, plazos definidos y división en múltiples cuotas.
* **Control de Estudiantes 👥:** Perfiles individuales que gestionan un ecosistema de pagos por grado y contacto.
* **Transparencia Total 🧾:** Exportación a PDF (jsPDF) e integración con Google Sheets (Apps Script) para rendición de cuentas pública.
* **Multidivisas y Personalización 🌍:** Soporte para más de 7 divisas y temas Light/Dark optimizados para la lectura.

## 🎨 Sistema de Diseño (UI/UX)

El diseño sigue una filosofía de **"Gestión con propósito"**, utilizando tonos botánicos para reducir el estrés de manejar dinero escolar:

* **Tipografía:** *Playfair Display* (Serif) para un estatus institucional Premium e *Inter* (Sans) para máxima legibilidad en la interfaz.
* **Paleta de Colores:** * **Gama Bosque (Primarios):** Verdes saturados (#243b24) que inspiran crecimiento y confianza.
    * **Gama Salvia (Neutros):** Tonos tierra (#f4f7f4) para fondos y superficies que reducen la fricción psicológica.
* **Componentes:** Uso de *Glassmorphism* (.glass-card) y microinteracciones fluidas potenciadas por Framer Motion.

## 💻 Stack Tecnológico

Savia Escolar está construida sobre tecnologías de punta para asegurar un rendimiento instantáneo:
* **Frontend:** React v19 + Vite.
* **Backend:** Firebase (Firestore para base de datos reactiva y Google Auth).
* **Estilos:** Tailwind CSS v4 + Framer Motion.
* **Automatización:** Google Apps Script para sincronización con herramientas de Google Workspace.

## 🚀 Configuración y Despliegue Local

**Prerrequisitos:** Node.js instalado y Firebase CLI (`npm install -g firebase-tools`).

1. **Instalación de dependencias:**
   Ejecuta en la terminal:
   ```bash
   npm install
