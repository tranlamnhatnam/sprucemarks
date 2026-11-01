'use strict';

// Shared state for Pine extension pages
const pineState = {
    ancestor: {},
    option: {},
    preference: {},
    setting: {},
    tools: {
        bookmark_history: [],
        duplicate_bookmarks: {},
        empty_folders: {},
        similar_bookmarks: {}
    },
    port: null,
    listeners: {
        initOptions: [],
        initTools: [],
        initHistory: [],
        optionSet: [],
        preferenceSet: []
    }
};

const ANCESTOR_NAMES = {
    bookmarks_bar: 'Thanh dấu trang (Bookmarks Bar)',
    favorites_bar: 'Thanh mục yêu thích (Favorites Bar)',
    other_bookmarks: 'Dấu trang khác (Other Bookmarks)',
    other_favorites: 'Mục yêu thích khác (Other Favorites)',
    mobile_bookmarks: 'Dấu trang di động (Mobile Bookmarks)',
    mobile_favorites: 'Mục yêu thích di động (Mobile Favorites)',
    bookmarks_menu: 'Menu dấu trang (Bookmarks Menu)',
    bookmarks_toolbar: 'Thanh công cụ dấu trang',
    imported_bookmarks: 'Dấu trang đã nhập (Imported)',
    speed_dials: 'Quay số nhanh (Speed Dials)',
    unsorted_bookmarks: 'Dấu trang chưa phân loại',
    trash: 'Thùng rác (Trash)'
};

const SORT_LABELS = {
    alpha: 'Tên A – Z',
    alphaReverse: 'Tên Z – A',
    date: 'Mới nhất trước',
    dateReverse: 'Cũ nhất trước',
    url: 'URL A – Z',
    urlReverse: 'URL Z – A',
    '': 'Chưa chọn kiểu'
};

// Toast notification
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


// Dynamic browser tab favicon updater
function updateTabFavicon(iconColor) {
    let iconName = 'icon-default-32.png';
    if (iconColor === 'green') {
        iconName = 'icon-green-32.png';
    } else if (iconColor === 'dark') {
        iconName = 'icon-dark-32.png';
    } else if (iconColor === 'light') {
        iconName = 'icon-light-32.png';
    } else if (iconColor === 'automatic') {
        const isDarkOS = window.matchMedia('(prefers-color-scheme: dark)').matches;
        iconName = isDarkOS ? 'icon-light-32.png' : 'icon-dark-32.png';
    }

    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    link.href = '/images/icon/' + iconName;
}

// Theme handling
function applyTheme(theme) {
    const isDarkOS = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark = false;

    if (theme === 'dark') {
        isDark = true;
    } else if (theme === 'light') {
        isDark = false;
    } else {
        isDark = isDarkOS;
    }

    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
}

// Safe send message to background
function safePostMessage(msg) {
    if (pineState.port) {
        try {
            pineState.port.postMessage(msg);
        } catch (e) {
            console.warn('Pine port message failed:', e);
        }
    }
}

// Send option to background
function setOption(name, value) {
    pineState.option[name] = value;
    safePostMessage({
        subject: 'option-set',
        name: name,
        value: value
    });
}

// Send preference to background
function setPreference(name, value) {
    pineState.preference[name] = value;
    safePostMessage({
        subject: 'preference-set',
        name: name,
        value: value
    });
}

// Trigger manual sort
function triggerSortNow(btnEl) {
    if (!pineState.port) return;
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.dataset.originalHtml = btnEl.innerHTML;
        btnEl.innerHTML = '<span class="spinner"></span> <span>Đang sắp xếp...</span>';
    }

    safePostMessage({ subject: 'sort-now' });
}

function resetSortButtons() {
    const btns = document.querySelectorAll('.btn-sort-now');
    btns.forEach(btn => {
        btn.disabled = false;
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
        } else {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                <span>Sắp xếp ngay</span>
            `;
        }
    });
}

function updateToolBadges() {
    const emptyFolders = pineState.tools.empty_folders || {};
    const emptyCount = Array.isArray(emptyFolders) ? emptyFolders.length : Object.keys(emptyFolders).length;

    const dup = pineState.tools.duplicate_bookmarks || {};
    let dupCount = 0;
    if (Array.isArray(dup)) {
        dupCount = dup.length;
    } else if (dup && typeof dup === 'object') {
        Object.values(dup).forEach(arr => {
            if (Array.isArray(arr)) dupCount += (arr.length > 1 ? arr.length - 1 : arr.length);
        });
    }

    const sim = pineState.tools.similar_bookmarks || {};
    let simCount = 0;
    if (Array.isArray(sim)) {
        simCount = sim.length;
    } else if (sim && typeof sim === 'object') {
        Object.values(sim).forEach(arr => {
            if (Array.isArray(arr)) simCount += (arr.length > 1 ? arr.length - 1 : arr.length);
        });
    }

    const emptyBadges = document.querySelectorAll('#count-empty-folders, .badge-count-empty');
    emptyBadges.forEach(b => { b.textContent = emptyCount; });

    const dupBadges = document.querySelectorAll('#count-duplicates, .badge-count-duplicates');
    dupBadges.forEach(b => { b.textContent = dupCount; });

    const simBadges = document.querySelectorAll('#count-similar, .badge-count-similar');
    simBadges.forEach(b => { b.textContent = simCount; });
}

// Connect to background service worker
function initPineCore(currentPageKey) {
    // Highlight sidebar active item and subitem
    const navLinks = document.querySelectorAll('.nav-item, .nav-subitem, .tool-subnav-link');
    navLinks.forEach(link => {
        const page = link.dataset.page || link.dataset.subpage;
        link.classList.toggle('active', page === currentPageKey);
    });

    // Expand matching tool group submenu
    const isCleanup = ['tools-empty', 'tools-duplicates', 'tools-similar', 'tools-broken', 'tools-dormant'].includes(currentPageKey);
    const isUtility = ['tools-replace', 'tools-favicons'].includes(currentPageKey);

    const cleanupGroup = document.getElementById('nav-group-cleanup');
    if (cleanupGroup) {
        cleanupGroup.classList.toggle('expanded', isCleanup);
        const pLink = cleanupGroup.querySelector('.nav-parent');
        if (pLink) pLink.classList.toggle('active', isCleanup);
    }

    const utilityGroup = document.getElementById('nav-group-utilities');
    if (utilityGroup) {
        utilityGroup.classList.toggle('expanded', isUtility);
        const pLink = utilityGroup.querySelector('.nav-parent');
        if (pLink) pLink.classList.toggle('active', isUtility);
    }

    // Version label
    const versionEl = document.getElementById('app-version');
    if (versionEl && browser.runtime.getManifest) {
        versionEl.textContent = 'v' + browser.runtime.getManifest().version;
    }

    // Support link
    const supportLink = document.getElementById('link-support');
    if (supportLink) {
        supportLink.onclick = (e) => {
            e.preventDefault();
            showToast('Cảm ơn bạn đã đồng hành và ủng hộ Pine!');
        };
    }

    // Connect port
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) { /* consume */ }
        let isUnloading = false;
        window.addEventListener('beforeunload', () => {
            isUnloading = true;
        });

        const port = browser.runtime.connect({ name: 'options' });
        pineState.port = port;

        port.onMessage.addListener(handlePortMessage);
        port.onDisconnect.addListener(() => {
            // Check and consume lastError to prevent "Receiving end does not exist" console noise
            const lastErr = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) || (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError);
            pineState.port = null;
            if (!isUnloading) {
                setTimeout(() => {
                    if (!isUnloading) initPineCore(currentPageKey);
                }, 2000);
            }
        });

        // Request initial states
        safePostMessage({ subject: 'init-options' });
        if (currentPageKey === 'history') {
            safePostMessage({ subject: 'init-history' });
        } else if (currentPageKey && currentPageKey.startsWith('tools')) {
            safePostMessage({ subject: 'init-tools' });
        }
    } catch (err) {
        console.error('Failed to connect to background:', err);
    }
}

function handlePortMessage(msg) {
    if (!msg || !msg.subject) return;

    switch (msg.subject) {
        case 'init-history':
            if (msg.bookmark_history) pineState.tools.bookmark_history = msg.bookmark_history;
            pineState.listeners.initHistory.forEach(fn => fn(pineState));
            break;

        case 'init-options':
            pineState.ancestor = msg.ancestor || {};
            pineState.option = msg.option || {};
            pineState.preference = msg.preference || {};
            pineState.setting = msg.setting || {};

            applyTheme(pineState.preference.theme);
            updateTabFavicon(pineState.preference.icon_color);
            pineState.listeners.initOptions.forEach(fn => fn(pineState));
            break;

        case 'init-tools':
            if (msg.bookmark_history) pineState.tools.bookmark_history = msg.bookmark_history;
            if (msg.duplicate_bookmarks) pineState.tools.duplicate_bookmarks = msg.duplicate_bookmarks;
            if (msg.empty_folders) pineState.tools.empty_folders = msg.empty_folders;
            if (msg.similar_bookmarks) pineState.tools.similar_bookmarks = msg.similar_bookmarks;

            updateToolBadges();
            pineState.listeners.initTools.forEach(fn => fn(pineState));
            break;

        case 'option-set':
            if (msg.name) {
                pineState.option[msg.name] = msg.value;
                pineState.listeners.optionSet.forEach(fn => fn(msg.name, msg.value));
            }
            break;

        case 'preference-set':
            if (msg.name) {
                pineState.preference[msg.name] = msg.value;
                if (msg.name === 'theme') applyTheme(msg.value);
                if (msg.name === 'icon_color') updateTabFavicon(msg.value);
                pineState.listeners.preferenceSet.forEach(fn => fn(msg.name, msg.value));
            }
            break;

        case 'ancestor-and-option':
            pineState.ancestor = msg.ancestor || {};
            pineState.option = msg.option || {};
            pineState.listeners.initOptions.forEach(fn => fn(pineState));
            break;

        case 'sort-now-done':
            resetSortButtons();
            showToast('Đã sắp xếp lại toàn bộ dấu trang thành công!', 'success');
            safePostMessage({ subject: 'init-tools' });
            break;

        case 'tool-empty-folders-removed':
        case 'tool-duplicate-bookmarks-removed':
        case 'tool-similar-bookmarks-removed':
        case 'tool-bookmark-history-cleared':
            showToast('Thao tác dọn dẹp hoàn tất thành công!', 'success');
            safePostMessage({ subject: 'init-tools' });
            break;

        case 'import-settings-done':
            showToast('Khôi phục cấu hình thành công!', 'success');
            setTimeout(() => window.location.reload(), 1000);
            break;

        case 'cloud-sync-status':
            showToast('Đã tự động cập nhật cài đặt mới nhất từ đám mây Chrome Sync!', 'info');
            break;
    }
}

// --- SNAPSHOT & RESTORE ENGINE ---
function countBookmarkTree(nodes) {
    let bookmarks = 0;
    let folders = 0;
    function traverse(list) {
        if (!list || !Array.isArray(list)) return;
        for (const node of list) {
            if (node.url) {
                bookmarks++;
            } else {
                folders++;
                if (node.children) traverse(node.children);
            }
        }
    }
    traverse(nodes);
    return { bookmarks, folders };
}

async function getBookmarkTreeAsync() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree) {
            chrome.bookmarks.getTree(resolve);
        } else if (typeof browser !== 'undefined' && browser.bookmarks && browser.bookmarks.getTree) {
            browser.bookmarks.getTree().then(resolve).catch(() => resolve([]));
        } else {
            resolve([]);
        }
    });
}

async function getRestorePoints() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['pine_restore_points'], (res) => {
            const list = (res && Array.isArray(res.pine_restore_points)) ? res.pine_restore_points : [];
            resolve(list);
        });
    });
}

async function createAutoRestorePoint(reason) {
    try {
        const tree = await getBookmarkTreeAsync();
        if (!tree || tree.length === 0) return null;

        const stats = countBookmarkTree(tree);
        const existing = await getRestorePoints();

        const newSnapshot = {
            id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            timestamp: Date.now(),
            reason: reason || 'Bản chụp thủ công',
            totalBookmarks: stats.bookmarks,
            totalFolders: stats.folders,
            tree: tree
        };

        const updated = [newSnapshot, ...existing].slice(0, 10);
        await new Promise((resolve) => {
            chrome.storage.local.set({ pine_restore_points: updated }, resolve);
        });

        console.log('Snapshot created successfully:', newSnapshot.reason);
        return newSnapshot;
    } catch (err) {
        console.error('Failed to create snapshot:', err);
        return null;
    }
}

async function deleteRestorePoint(id) {
    const existing = await getRestorePoints();
    const updated = existing.filter(s => s.id !== id);
    await new Promise((resolve) => {
        chrome.storage.local.set({ pine_restore_points: updated }, resolve);
    });
    return updated;
}

async function restoreFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.tree) {
        throw new Error('Dữ liệu snapshot không hợp lệ');
    }

    // 1. Take safety snapshot before restoring
    await createAutoRestorePoint('Trước khi khôi phục từ snapshot ' + new Date(snapshot.timestamp).toLocaleString());

    // 2. Perform restoration
    const rootNodes = snapshot.tree[0] && snapshot.tree[0].children ? snapshot.tree[0].children : snapshot.tree;

    for (const snapRootFolder of rootNodes) {
        if (!snapRootFolder.id) continue;

        // Fetch current children in this root container
        const currentChildren = await new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getChildren) {
                chrome.bookmarks.getChildren(snapRootFolder.id, (children) => resolve(children || []));
            } else if (typeof browser !== 'undefined' && browser.bookmarks && browser.bookmarks.getChildren) {
                browser.bookmarks.getChildren(snapRootFolder.id).then(resolve).catch(() => resolve([]));
            } else {
                resolve([]);
            }
        });

        // Remove existing children inside this container
        for (const child of currentChildren) {
            await new Promise((resolve) => {
                if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.removeTree) {
                    chrome.bookmarks.removeTree(child.id, () => resolve());
                } else if (typeof browser !== 'undefined' && browser.bookmarks && browser.bookmarks.removeTree) {
                    browser.bookmarks.removeTree(child.id).then(resolve).catch(() => resolve());
                } else {
                    resolve();
                }
            });
        }

        // Recreate hierarchy from snapshot
        async function restoreNode(node, parentId) {
            if (node.url) {
                await new Promise((resolve) => {
                    const createData = {
                        parentId: parentId,
                        title: node.title || '',
                        url: node.url
                    };
                    if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.create) {
                        chrome.bookmarks.create(createData, resolve);
                    } else {
                        browser.bookmarks.create(createData).then(resolve).catch(resolve);
                    }
                });
            } else {
                const createdFolder = await new Promise((resolve) => {
                    const createData = {
                        parentId: parentId,
                        title: node.title || 'Thư mục'
                    };
                    if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.create) {
                        chrome.bookmarks.create(createData, resolve);
                    } else {
                        browser.bookmarks.create(createData).then(resolve).catch(resolve);
                    }
                });

                if (node.children && node.children.length > 0 && createdFolder) {
                    for (const child of node.children) {
                        await restoreNode(child, createdFolder.id);
                    }
                }
            }
        }

        if (snapRootFolder.children && snapRootFolder.children.length > 0) {
            for (const child of snapRootFolder.children) {
                await restoreNode(child, snapRootFolder.id);
            }
        }
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    try {
        return new Date(timestamp).toLocaleString('vi-VN');
    } catch {
        return String(timestamp);
    }
}

// Global PineCore namespace export
window.PineCore = {
    getBookmarkTreeAsync,
    createAutoRestorePoint,
    getRestorePoints,
    deleteRestorePoint,
    restoreFromSnapshot,
    countBookmarkTree,
    formatDate,
    showToast,
    initPineCore,
    state: pineState
};
