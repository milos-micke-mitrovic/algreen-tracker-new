import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Upload, Button, List, Space, Typography, Modal, App } from 'antd';
import { UploadOutlined, CloseCircleOutlined, FilePdfOutlined, EyeOutlined, UndoOutlined } from '@ant-design/icons';
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

export interface OrderAttachmentsHandle {
  hasPendingChanges: () => boolean;
  savePending: () => Promise<boolean>;
  resetPending: () => void;
}

interface OrderAttachmentsProps {
  orderId: string;
  orderItemId?: string;
  attachments: OrderAttachmentDto[];
  readOnly?: boolean;
}

export const OrderAttachments = forwardRef<OrderAttachmentsHandle, OrderAttachmentsProps>(
  function OrderAttachments({ orderId, orderItemId, attachments, readOnly = false }, ref) {
    const tenantId = useAuthStore((s) => s.tenantId);
    const user = useAuthStore((s) => s.user);
    const [pendingUploads, setPendingUploads] = useState<File[]>([]);
    const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
    const [pdfPreview, setPdfPreview] = useState<string | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [pendingPreviewType, setPendingPreviewType] = useState<'image' | 'pdf'>('image');
    const { message } = App.useApp();
    const { t } = useTranslation('dashboard');

    const canManage = !readOnly && (
      user?.role === UserRole.SalesManager ||
      user?.role === UserRole.Manager ||
      user?.role === UserRole.Admin);

    // Reset pending state when order changes
    useEffect(() => {
      setPendingUploads([]);
      setPendingDeletes(new Set());
    }, [orderId, orderItemId]);

    const visibleAttachments = attachments.filter((a) => !pendingDeletes.has(a.id));
    const totalCount = visibleAttachments.length + pendingUploads.length;

    useImperativeHandle(ref, () => ({
      hasPendingChanges: () => pendingUploads.length > 0 || pendingDeletes.size > 0,
      savePending: async () => {
        const deletesToProcess = Array.from(pendingDeletes);
        const uploadsToProcess = [...pendingUploads];
        setPendingDeletes(new Set());
        setPendingUploads([]);
        try {
          for (const attachmentId of deletesToProcess) {
            await ordersApi.deleteAttachment(orderId, attachmentId, tenantId!);
          }
          for (const file of uploadsToProcess) {
            const compressed = await compressFile(file);
            await ordersApi.uploadAttachment(orderId, compressed, tenantId!, orderItemId);
          }
          return true;
        } catch {
          message.error(t('attachments.uploadFailed'));
          return false;
        }
      },
      resetPending: () => {
        setPendingUploads([]);
        setPendingDeletes(new Set());
      },
    }));

    const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

    const openPendingFilePreview = (file: File) => {
      const url = URL.createObjectURL(file);
      if (file.type === 'application/pdf') {
        setPendingPreviewType('pdf');
        setPendingPreview(url + '#toolbar=0&navpanes=0');
      } else {
        setPendingPreviewType('image');
        setPendingPreview(url);
      }
    };

    return (
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('attachments.title')} ({totalCount}/10)
        </Text>

        {canManage && (
          <Upload
            beforeUpload={(file) => {
              if (file.size > MAX_FILE_SIZE) {
                message.error(t('attachments.fileTooLarge'));
                return false;
              }
              if (totalCount >= 10) return false;
              setPendingUploads((prev) => [...prev, file]);
              return false;
            }}
            showUploadList={false}
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            disabled={totalCount >= 10}
          >
            <Button
              icon={<UploadOutlined />}
              disabled={totalCount >= 10}
              size="small"
              style={{ marginBottom: 8 }}
            >
              {t('attachments.upload')}
            </Button>
          </Upload>
        )}

        {/* Existing (server) attachments */}
        <List
          size="small"
          dataSource={visibleAttachments}
          locale={{ emptyText: pendingUploads.length > 0 ? ' ' : t('attachments.noAttachments') }}
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
                      <Button
                        key="delete"
                        type="text"
                        size="small"
                        danger
                        icon={<CloseCircleOutlined />}
                        onClick={() => setPendingDeletes((prev) => new Set(prev).add(item.id))}
                      />,
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

        {/* Pending (not yet uploaded) files */}
        {pendingUploads.length > 0 && (
          <List
            size="small"
            dataSource={pendingUploads}
            renderItem={(file: File, index: number) => (
              <List.Item
                style={{ padding: '4px 0' }}
                actions={[
                  <Button key="preview" type="text" size="small" icon={<EyeOutlined />} onClick={() => openPendingFilePreview(file)} />,
                  <Button
                    key="delete"
                    type="text"
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => setPendingUploads((prev) => prev.filter((_, i) => i !== index))}
                  />,
                ]}
              >
                <Space size={8}>
                  {file.type.startsWith('image/') ? (
                    <img
                      src={URL.createObjectURL(file)}
                      width={40} height={40}
                      style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                      onClick={() => openPendingFilePreview(file)}
                      alt={file.name}
                    />
                  ) : (
                    <FilePdfOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
                  )}
                  <div>
                    <Text ellipsis style={{ maxWidth: 200 }}>{file.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatFileSize(file.size)}
                    </Text>
                  </div>
                </Space>
              </List.Item>
            )}
          />
        )}

        {/* Pending deletes — show as strikethrough with undo */}
        {pendingDeletes.size > 0 && (
          <List
            size="small"
            dataSource={attachments.filter((a) => pendingDeletes.has(a.id))}
            renderItem={(item: OrderAttachmentDto) => (
              <List.Item
                style={{ padding: '4px 0', opacity: 0.4 }}
                actions={[
                  <Button
                    key="undo"
                    type="text"
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={() => setPendingDeletes((prev) => {
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    })}
                  />,
                ]}
              >
                <Space size={8}>
                  <FilePdfOutlined style={{ fontSize: 24, color: '#d9d9d9' }} />
                  <Text delete ellipsis style={{ maxWidth: 200 }}>
                    {item.originalFileName}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        )}

        {/* Image Preview Modal */}
        <Modal
          open={!!imagePreview}
          onCancel={() => setImagePreview(null)}
          footer={null}
          width="80vw"
          style={{ top: 20 }}
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

        {/* Pending file preview modal */}
        <Modal
          open={!!pendingPreview}
          onCancel={() => {
            if (pendingPreview) URL.revokeObjectURL(pendingPreview.split('#')[0]);
            setPendingPreview(null);
          }}
          footer={null}
          width="80vw"
          style={{ top: 20 }}
          destroyOnHidden
        >
          {pendingPreview && pendingPreviewType === 'image' && (
            <img src={pendingPreview} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }} alt="Preview" />
          )}
          {pendingPreview && pendingPreviewType === 'pdf' && (
            <iframe src={pendingPreview} style={{ width: '100%', height: '80vh', border: 'none' }} title="PDF Preview" />
          )}
        </Modal>
      </div>
    );
  }
);
