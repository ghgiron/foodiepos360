import Modal from './Modal';
import SupplierForm from '../supplierForm';

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (newSupplierId: string) => void;
}

export function CreateSupplierModal({
  isOpen,
  onClose,
  onSupplierCreated
}: CreateSupplierModalProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear Nuevo Proveedor" size="2xl">
      <div className="w-full max-w-2xl mx-auto text-left font-sans">
        <SupplierForm
          onCancel={onClose}
          onSaved={(newId) => {
            if (newId) onSupplierCreated(newId);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

export default CreateSupplierModal;
