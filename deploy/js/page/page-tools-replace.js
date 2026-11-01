'use strict';

document.addEventListener('DOMContentLoaded', () => {
    initPineCore('tools-replace');

    const inputFind = document.getElementById('input-find-url');
    const inputReplace = document.getElementById('input-replace-url');
    const optCaseSensitive = document.getElementById('opt-case-sensitive');
    const optUseRegex = document.getElementById('opt-use-regex');
    const btnPreview = document.getElementById('btn-search-preview');
    const btnReset = document.getElementById('btn-reset-form');

    const previewActionBar = document.getElementById('preview-action-bar');
    const previewMatchCount = document.getElementById('preview-match-count');
    const btnSelectAll = document.getElementById('btn-select-all-matches');
    const btnDeselectAll = document.getElementById('btn-deselect-all-matches');
    const btnExecute = document.getElementById('btn-execute-replacement');

    const emptyState = document.getElementById('replace-empty-state');
    const matchesList = document.getElementById('replace-matches-list');

    let currentMatches = [];

    if (btnReset) {
        btnReset.onclick = () => {
            inputFind.value = '';
            inputReplace.value = '';
            optCaseSensitive.checked = false;
            optUseRegex.checked = false;
            currentMatches = [];
            previewActionBar.style.display = 'none';
            matchesList.style.display = 'none';
            emptyState.style.display = 'block';
            emptyState.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                <p>Nhập chuỗi cần tìm và chuỗi thay thế ở trên, sau đó bấm <strong>Tìm kiếm & Xem trước</strong>.</p>
            `;
        };
    }

    if (btnPreview) {
        btnPreview.onclick = runPreviewSearch;
    }

    // Trigger preview on Enter key
    [inputFind, inputReplace].forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    runPreviewSearch();
                }
            });
        }
    });

    if (btnSelectAll) {
        btnSelectAll.onclick = () => {
            matchesList.querySelectorAll('.replace-cb').forEach(cb => { cb.checked = true; });
            updateExecuteBtnState();
        };
    }

    if (btnDeselectAll) {
        btnDeselectAll.onclick = () => {
            matchesList.querySelectorAll('.replace-cb').forEach(cb => { cb.checked = false; });
            updateExecuteBtnState();
        };
    }

    function updateExecuteBtnState() {
        if (!btnExecute) return;
        const checkedCount = matchesList.querySelectorAll('.replace-cb:checked').length;
        btnExecute.disabled = (checkedCount === 0);
        btnExecute.innerHTML = `<span>Thực hiện thay thế (${checkedCount} mục)</span>`;
    }

    async function runPreviewSearch() {
        const findStr = inputFind.value;
        const replaceStr = inputReplace.value;

        if (!findStr) {
            showToast('Vui lòng nhập chuỗi cần tìm kiếm!', 'error');
            inputFind.focus();
            return;
        }

        btnPreview.disabled = true;
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<p>Đang tìm kiếm dấu trang khớp...</p>';
        matchesList.style.display = 'none';
        previewActionBar.style.display = 'none';

        let regex;
        try {
            if (optUseRegex.checked) {
                regex = new RegExp(findStr, optCaseSensitive.checked ? 'g' : 'gi');
            } else {
                const escaped = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escaped, optCaseSensitive.checked ? 'g' : 'gi');
            }
        } catch (err) {
            showToast('Biểu thức chính quy (RegEx) không hợp lệ!', 'error');
            btnPreview.disabled = false;
            emptyState.innerHTML = `<p style="color: var(--danger-color);">Lỗi RegEx: ${escapeHtml(err.message)}</p>`;
            return;
        }

        try {
            const tree = await browser.bookmarks.getTree();
            const matches = [];

            function traverse(node, path) {
                const isRoot = (node.id === '0' || !node.id);
                const currentPath = isRoot ? '' : (path ? `${path} / ${node.title || 'Thư mục'}` : (node.title || 'Thư mục'));

                if (node.url) {
                    regex.lastIndex = 0;
                    if (regex.test(node.url)) {
                        regex.lastIndex = 0;
                        const newUrl = node.url.replace(regex, replaceStr);
                        matches.push({
                            id: node.id,
                            title: node.title || 'Dấu trang không tên',
                            oldUrl: node.url,
                            newUrl: newUrl,
                            location: path || 'Gốc'
                        });
                    }
                }

                if (node.children) {
                    for (const child of node.children) {
                        traverse(child, currentPath);
                    }
                }
            }

            traverse(tree[0] || tree, '');

            currentMatches = matches;
            btnPreview.disabled = false;

            if (matches.length === 0) {
                emptyState.style.display = 'block';
                emptyState.innerHTML = '<p>Không tìm thấy dấu trang nào khớp với chuỗi tìm kiếm.</p>';
                matchesList.style.display = 'none';
                previewActionBar.style.display = 'none';
                return;
            }

            // Render Results
            emptyState.style.display = 'none';
            matchesList.style.display = 'block';
            previewActionBar.style.display = 'flex';
            previewMatchCount.textContent = `Tìm thấy ${matches.length} dấu trang khớp`;

            matchesList.innerHTML = '';
            matches.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'list-item';
                row.style.padding = '12px 16px';
                row.innerHTML = `
                    <div class="list-item-left" style="cursor: default;">
                        <input type="checkbox" class="checkbox-custom replace-cb" data-id="${item.id}" data-new-url="${escapeHtml(item.newUrl)}" checked style="margin-top: 2px;">
                        <div class="item-content" style="flex: 1; min-width: 0;">
                            <div class="item-title" style="display: flex; align-items: center; gap: 8px;">
                                <span>${escapeHtml(item.title)}</span>
                                <span class="badge badge-neutral">${escapeHtml(item.location)}</span>
                                <a href="${escapeHtml(item.oldUrl)}" target="_blank" rel="noopener noreferrer" class="link-external" title="Mở URL cũ trong tab mới">
                                    <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                                </a>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                                <div><span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Cũ: </span><span class="diff-old">${escapeHtml(item.oldUrl)}</span></div>
                                <div><span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Mới: </span><span class="diff-new">${escapeHtml(item.newUrl)}</span></div>
                            </div>
                        </div>
                    </div>
                `;
                matchesList.appendChild(row);
            });

            matchesList.querySelectorAll('.replace-cb').forEach(cb => {
                cb.onchange = updateExecuteBtnState;
            });

            updateExecuteBtnState();

        } catch (err) {
            btnPreview.disabled = false;
            console.error('Batch replace preview error:', err);
            showToast('Lỗi khi tìm kiếm dấu trang!', 'error');
        }
    }

    if (btnExecute) {
        btnExecute.onclick = async () => {
            const checkedBoxes = Array.from(matchesList.querySelectorAll('.replace-cb:checked'));
            if (checkedBoxes.length === 0) return;

            const count = checkedBoxes.length;
            if (!confirm(`Bạn có chắc chắn muốn cập nhật URL cho ${count} dấu trang đã chọn không?`)) {
                return;
            }

            btnExecute.disabled = true;
            btnExecute.innerHTML = '<span class="spinner"></span> <span>Đang cập nhật...</span>';

            // Auto create snapshot before destructive update
            if (typeof createAutoRestorePoint === 'function') {
                try {
                    await createAutoRestorePoint(`Trước khi thay thế URL (${count} mục)`);
                } catch (e) {
                    console.warn('Auto snapshot error:', e);
                }
            }

            let updatedCount = 0;
            for (const cb of checkedBoxes) {
                const bookmarkId = cb.dataset.id;
                const newUrl = cb.dataset.newUrl;
                try {
                    if (typeof chrome !== 'undefined' && chrome.bookmarks && typeof chrome.bookmarks.update === 'function') {
                        await chrome.bookmarks.update(bookmarkId, { url: newUrl });
                    } else if (browser.bookmarks && typeof browser.bookmarks.update === 'function') {
                        await browser.bookmarks.update(bookmarkId, { url: newUrl });
                    }
                    updatedCount++;
                } catch (e) {
                    console.warn(`Failed to update bookmark ${bookmarkId}:`, e);
                }
            }

            showToast(`Đã thay thế thành công URL cho ${updatedCount} dấu trang!`, 'success');
            btnExecute.disabled = false;
            btnExecute.innerHTML = `<span>Thực hiện thay thế</span>`;

            // Re-run preview to reflect current bookmarks state
            setTimeout(runPreviewSearch, 500);
        };
    }
});
