'use strict';

document.addEventListener('DOMContentLoaded', () => {
    initPineCore('tools-empty');

    const refreshBtn = document.getElementById('btn-refresh-tools');
    const selectAllBtn = document.getElementById('btn-select-all');
    const deselectAllBtn = document.getElementById('btn-deselect-all');
    const removeBtn = document.getElementById('btn-remove-empty-folders');
    const list = document.getElementById('empty-folders-list');

    if (refreshBtn) {
        refreshBtn.onclick = () => {
            refreshBtn.disabled = true;
            list.innerHTML = '<div class="empty-state"><p>Đang quét lại thư mục trống...</p></div>';
            safePostMessage({ subject: 'init-tools' });
            setTimeout(() => { refreshBtn.disabled = false; }, 1000);
        };
    }

    if (selectAllBtn) {
        selectAllBtn.onclick = () => {
            const cbs = list.querySelectorAll('.empty-folder-cb');
            cbs.forEach(cb => { cb.checked = true; });
            updateRemoveBtnState();
        };
    }

    if (deselectAllBtn) {
        deselectAllBtn.onclick = () => {
            const cbs = list.querySelectorAll('.empty-folder-cb');
            cbs.forEach(cb => { cb.checked = false; });
            updateRemoveBtnState();
        };
    }

    function updateRemoveBtnState() {
        if (!removeBtn) return;
        const checkedCount = list.querySelectorAll('.empty-folder-cb:checked').length;
        removeBtn.disabled = (checkedCount === 0);
        removeBtn.textContent = checkedCount > 0 ? `Xóa ${checkedCount} thư mục đã chọn` : 'Xóa thư mục đã chọn';
    }

    function renderEmptyFolders() {
        if (!list) return;

        const raw = pineState.tools.empty_folders;
        const items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);

        const countBadge = document.getElementById('count-empty-folders');
        if (countBadge) countBadge.textContent = items.length;

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Không phát hiện thư mục trống nào. Bộ sưu tập dấu trang rất gọn gàng!</p></div>';
            if (removeBtn) {
                removeBtn.disabled = true;
                removeBtn.textContent = 'Xóa thư mục đã chọn';
            }
            return;
        }

        list.innerHTML = '';
        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'list-item';
            row.innerHTML = `
                <div class="list-item-left">
                    <input type="checkbox" class="checkbox-custom empty-folder-cb" data-id="${item.id}" checked>
                    <div class="item-avatar"><svg viewBox="0 0 24 24" fill="#F59E0B"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg></div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(item.title || 'Thư mục không tên')}</div>
                        <div class="item-subtitle">${escapeHtml(item.location || 'Vị trí')}</div>
                    </div>
                </div>
            `;
            list.appendChild(row);
        });

        // Attach change listeners to checkboxes
        list.querySelectorAll('.empty-folder-cb').forEach(cb => {
            cb.onchange = updateRemoveBtnState;
        });

        updateRemoveBtnState();

        if (removeBtn) {
            removeBtn.onclick = async () => {
                const selectedIds = Array.from(list.querySelectorAll('.empty-folder-cb:checked')).map(cb => cb.dataset.id);
                if (selectedIds.length === 0) return;
                if (confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedIds.length} thư mục trống đã chọn không?`)) {
                    if (typeof createAutoRestorePoint === 'function') {
                        try {
                            await createAutoRestorePoint(`Trước khi xóa ${selectedIds.length} thư mục rỗng`);
                        } catch (e) {
                            console.warn('Auto snapshot error:', e);
                        }
                    }
                    safePostMessage({
                        subject: 'tool-empty-folders-remove',
                        bookmarks: selectedIds
                    });
                }
            };
        }
    }

    pineState.listeners.initTools.push(renderEmptyFolders);

    // Initial render if data already exists in pineState
    if (pineState.tools.empty_folders) {
        renderEmptyFolders();
    }
});
