import { useState } from 'react';
import { Upload, Button, List, Space, Typography, Popconfirm, Modal, App } from 'antd';
import { UploadOutlined, DeleteOutlined, FilePdfOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@algreen/api-client';
import { useAuthStore } from '@algreen/auth';
import type { OrderAttachmentDto } from '@algreen/shared-types';
import { UserRole } from '@algreen/shared-types';
import { compressFile } from '../utils/compressImage';
import { useTranslation } from '@algreen/i18n';

const { Text } = Typography;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

interface OrderAttachmentsProps {
  orderId: string;
  orderItemId?: string;
}

export function OrderAttachments({ orderId, orderItemId }: OrderAttachmentsProps) {
  const tenantId = useAuthStore((s) => s.tenantId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { message } = App.useApp();
  const { t } = useTranslation('dashboard');

  const canManage =
    user?.role === UserRole.SalesManager ||
    user?.role === UserRole.Manager ||
    user?.role === UserRole.Admin;

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['order-attachments', orderId, orderItemId ?? 'order'],
    queryFn: () => ordersApi.getAttachments(orderId, orderItemId).then((r) => r.data),
    enabled: !!orderId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const compressed = await compressFile(file);
      return ordersApi.uploadAttachment(orderId, compressed, tenantId!, orderItemId).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-attachments', orderId, orderItemId ?? 'order'] });
      message.success(t('attachments.uploaded'));
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })
        ?.response?.data?.error;
      message.error(code?.message || t('attachments.uploadFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      ordersApi.deleteAttachment(orderId, attachmentId, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-attachments', orderId, orderItemId ?? 'order'] });
      message.success(t('attachments.deleted'));
    },
    onError: () => {
      message.error(t('attachments.deleteFailed'));
    },
  });

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      message.error(t('attachments.fileTooLarge'));
      return;
    }
    setUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setUploading(false);
    }
  };

  const getDownloadUrl = (attachment: OrderAttachmentDto) =>
    ordersApi.getAttachmentDownloadUrl(orderId, attachment.id);

  const openPdfPreview = async (attachment: OrderAttachmentDto) => {
    setPdfLoading(true);
    try {
      const url = getDownloadUrl(attachment);
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      setPdfPreview(blobUrl + '#toolbar=0&navpanes=0');
    } catch {
      message.error(t('attachments.previewFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('attachments.title')} ({attachments.length}/10)
      </Text>

      {canManage && (
        <Upload
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          showUploadList={false}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          disabled={uploading || attachments.length >= 10}
        >
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={attachments.length >= 10}
            size="small"
            style={{ marginBottom: 8 }}
          >
            {t('attachments.upload')}
          </Button>
        </Upload>
      )}

      <List
        size="small"
        loading={isLoading}
        dataSource={attachments}
        locale={{ emptyText: t('attachments.noAttachments') }}
        renderItem={(item: OrderAttachmentDto) => (
          <List.Item
            style={{ padding: '4px 0' }}
            actions={[
              <Button
                key="preview"
                type="text"
                size="small"
                icon={<EyeOutlined />}
                loading={pdfLoading}
                onClick={() => {
                  if (isImage(item.contentType)) setImagePreview(getDownloadUrl(item));
                  else openPdfPreview(item);
                }}
              />,
              ...(canManage
                ? [
                    <Popconfirm
                      key="delete"
                      title={t('attachments.confirmDelete')}
                      onConfirm={() => deleteMutation.mutate(item.id)}
                      okText={t('common:actions.confirm')}
                      cancelText={t('common:actions.no')}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : []),
            ]}
          >
            <Space size={8}>
              {isImage(item.contentType) ? (
                <img
                  src={getDownloadUrl(item)}
                  width={40}
                  height={40}
                  style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                  onClick={() => setImagePreview(getDownloadUrl(item))}
                  alt={item.originalFileName}
                />
              ) : (
                <FilePdfOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
              )}
              <div>
                <Text ellipsis style={{ maxWidth: 200 }}>
                  {item.originalFileName}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatFileSize(item.fileSizeBytes)}
                </Text>
              </div>
            </Space>
          </List.Item>
        )}
      />

      {/* Image Preview Modal */}
      <Modal
        open={!!imagePreview}
        onCancel={() => setImagePreview(null)}
        footer={null}
        width="80vw"
        style={{ top: 20 }}
        closeIcon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 14, color: '#000' }}>✕</span>}
        destroyOnHidden
      >
        {imagePreview && (
          <img
            src={imagePreview}
            style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            alt="Preview"
          />
        )}
      </Modal>

      {/* PDF Preview Modal */}
      <Modal
        open={!!pdfPreview}
        onCancel={() => {
          if (pdfPreview) URL.revokeObjectURL(pdfPreview.split('#')[0]);
          setPdfPreview(null);
        }}
        footer={null}
        width="80vw"
        style={{ top: 20 }}
        closeIcon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 14, color: '#000' }}>✕</span>}
        destroyOnHidden
      >
        {pdfPreview && (
          <iframe
            src={pdfPreview}
            style={{ width: '100%', height: '80vh', border: 'none' }}
            title="PDF Preview"
          />
        )}
      </Modal>
    </div>
  );
}
