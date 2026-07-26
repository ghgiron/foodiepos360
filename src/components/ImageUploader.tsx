// src/components/ImageUploader.tsx
import React, { useRef } from 'react';
import toast from 'react-hot-toast';

interface ImageUploaderProps {
  value?: string;
  onChange: (base64: string) => void;
  label?: string;
  helperText?: string;
  className?: string;
}

export default function ImageUploader({
  value,
  onChange,
  label = 'Imagen del Elemento',
  helperText = 'Soporta PNG, JPG, WEBP hasta 5MB',
  className = ''
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('El archivo supera el límite de 5MB.');
        return;
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Formato de imagen no permitido. Utiliza .jpg, .png o .webp.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('El archivo supera el límite de 5MB.');
        return;
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Formato de imagen no permitido. Utiliza .jpg, .png o .webp.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-6 rounded-3xl shadow-sm ${className}`}>
      <span className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
        {label}
      </span>
      
      {value ? (
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden group bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-850">
          <img
            src={value}
            alt="Vista previa de imagen"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-white/90 hover:bg-white text-slate-900 rounded-full p-2 flex items-center justify-center cursor-pointer shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-sm font-bold">edit</span>
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="bg-red-650 hover:bg-red-700 text-white rounded-full p-2 flex items-center justify-center cursor-pointer shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-sm font-bold">delete</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl py-8 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors cursor-pointer text-center"
        >
          <span className="material-symbols-outlined text-3xl mb-1.5 text-slate-400">cloud_upload</span>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Subir o arrastrar imagen</span>
          <span className="text-[10px] text-slate-500 mt-1">{helperText}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
