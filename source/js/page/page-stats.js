'use strict';

document.addEventListener('DOMContentLoaded', () => {
    initPineCore('stats');

    const refreshBtn = document.getElementById('btn-refresh-stats');
    const totalBookmarksEl = document.getElementById('stats-total-bookmarks');
    const totalFoldersEl = document.getElementById('stats-total-folders');
    const totalDomainsEl = document.getElementById('stats-total-domains');
    const httpsRateEl = document.getElementById('stats-https-rate');
    const domainsListEl = document.getElementById('domains-list-container');
    const foldersListEl = document.getElementById('folders-list-container');
    const chartContainerEl = document.getElementById('chart-container');
    const domainBadgeEl = document.getElementById('badge-domain-count');
    const folderBadgeEl = document.getElementById('badge-folder-count');

    if (refreshBtn) {
        refreshBtn.onclick = () => {
            refreshBtn.disabled = true;
            analyzeBookmarks();
            setTimeout(() => { refreshBtn.disabled = false; }, 800);
        };
    }

    async function analyzeBookmarks() {
        if (!browser.bookmarks || !browser.bookmarks.getTree) return;

        try {
            const tree = await browser.bookmarks.getTree();

            let totalBookmarks = 0;
            let totalFolders = 0;
            let httpsCount = 0;
            const domainCounts = {};
            const foldersList = [];
            const bookmarkTimestamps = [];

            function traverse(node, currentPath) {
                const isRoot = (node.id === '0' || !node.id);
                const path = isRoot ? '' : (currentPath ? `${currentPath} / ${node.title || 'Thư mục'}` : (node.title || 'Thư mục'));

                if (node.url) {
                    totalBookmarks++;
                    if (node.dateAdded) bookmarkTimestamps.push(node.dateAdded);

                    try {
                        const parsed = new URL(node.url);
                        if (parsed.protocol === 'https:') httpsCount++;
                        let host = parsed.hostname.toLowerCase();
                        if (host.startsWith('www.')) host = host.slice(4);
                        if (host) {
                            domainCounts[host] = (domainCounts[host] || 0) + 1;
                        }
                    } catch (err) {}
                } else {
                    if (!isRoot) {
                        totalFolders++;
                        let childrenCount = 0;
                        if (node.children) {
                            function countDescendants(children) {
                                for (const c of children) {
                                    if (c.url) childrenCount++;
                                    if (c.children) countDescendants(c.children);
                                }
                            }
                            countDescendants(node.children);
                        }
                        foldersList.push({
                            id: node.id,
                            title: node.title || 'Thư mục không tên',
                            path: currentPath || 'Gốc',
                            count: childrenCount
                        });
                    }
                }

                if (node.children) {
                    for (const child of node.children) {
                        traverse(child, path);
                    }
                }
            }

            traverse(tree[0] || tree, '');

            // 1. KPI cards
            const distinctDomains = Object.keys(domainCounts).length;
            if (totalBookmarksEl) totalBookmarksEl.textContent = totalBookmarks.toLocaleString();
            if (totalFoldersEl) totalFoldersEl.textContent = totalFolders.toLocaleString();
            if (totalDomainsEl) totalDomainsEl.textContent = distinctDomains.toLocaleString();

            const httpsRate = totalBookmarks > 0 ? Math.round((httpsCount / totalBookmarks) * 100) : 100;
            if (httpsRateEl) httpsRateEl.textContent = `${httpsRate}%`;

            // 2. Render Top Domains
            const sortedDomains = Object.entries(domainCounts)
                .sort((a, b) => b[1] - a[1]);

            if (domainBadgeEl) domainBadgeEl.textContent = `${distinctDomains} tên miền`;

            if (sortedDomains.length === 0) {
                domainsListEl.innerHTML = '<div class="empty-state"><p>Chưa có dữ liệu tên miền.</p></div>';
            } else {
                domainsListEl.innerHTML = '';
                const maxCount = sortedDomains[0][1] || 1;
                const top15 = sortedDomains.slice(0, 15);

                top15.forEach(([domain, count], idx) => {
                    const percent = Math.round((count / totalBookmarks) * 100);
                    const barWidth = Math.max(4, Math.round((count / maxCount) * 100));

                    const row = document.createElement('div');
                    row.className = 'domain-row';
                    row.innerHTML = `
                        <div class="domain-left">
                            <span class="domain-rank">#${idx + 1}</span>
                            <span class="domain-name" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
                        </div>
                        <div class="domain-bar-bg">
                            <div class="domain-bar-fill" style="width: ${barWidth}%"></div>
                        </div>
                        <span class="domain-count">${count.toLocaleString()} (${percent}%)</span>
                    `;
                    domainsListEl.appendChild(row);
                });
            }

            // 3. Render Largest Folders
            foldersList.sort((a, b) => b.count - a.count);
            if (folderBadgeEl) folderBadgeEl.textContent = `${totalFolders} thư mục`;

            if (foldersList.length === 0) {
                foldersListEl.innerHTML = '<div class="empty-state"><p>Chưa có thư mục nào.</p></div>';
            } else {
                foldersListEl.innerHTML = '';
                const top15Folders = foldersList.slice(0, 15);

                top15Folders.forEach((folder) => {
                    const row = document.createElement('div');
                    row.className = 'folder-row';
                    row.innerHTML = `
                        <div class="folder-info">
                            <div class="folder-title">${escapeHtml(folder.title)}</div>
                            <div class="folder-path">${escapeHtml(folder.path)}</div>
                        </div>
                        <span class="badge badge-neutral" style="font-weight: 700; font-size: 12px; margin-left: 12px;">
                            ${folder.count.toLocaleString()} mục
                        </span>
                    `;
                    foldersListEl.appendChild(row);
                });
            }

            // 4. Render Growth SVG Chart
            renderGrowthChart(bookmarkTimestamps, totalBookmarks);

        } catch (e) {
            console.error('Stats analysis failed:', e);
        }
    }

    function renderGrowthChart(timestamps, totalCount) {
        if (!chartContainerEl) return;

        if (totalCount === 0 || timestamps.length === 0) {
            chartContainerEl.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Chưa có đủ dữ liệu lịch sử để vẽ biểu đồ.</div>';
            return;
        }

        // Generate 7 time points (last 7 days or periods)
        const pointsCount = 7;
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const historyData = [];

        for (let i = pointsCount - 1; i >= 0; i--) {
            const cutoff = now - (i * oneDay);
            const countAtCutoff = timestamps.filter(t => t <= cutoff).length;
            const dateObj = new Date(cutoff);
            const label = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
            historyData.push({ label, count: Math.max(1, countAtCutoff) });
        }

        // Normalize counts for SVG
        const counts = historyData.map(d => d.count);
        const minVal = Math.min(...counts);
        const maxVal = Math.max(...counts, minVal + 1);

        const svgWidth = 680;
        const svgHeight = 150;
        const padding = 24;

        const effectiveW = svgWidth - padding * 2;
        const effectiveH = svgHeight - padding * 2;

        const points = historyData.map((d, idx) => {
            const x = padding + (idx / (pointsCount - 1)) * effectiveW;
            const normY = (d.count - minVal) / (maxVal - minVal);
            const y = (svgHeight - padding) - (normY * effectiveH);
            return { x, y, count: d.count, label: d.label };
        });

        const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${svgHeight - padding} L ${points[0].x.toFixed(1)} ${svgHeight - padding} Z`;

        const circles = points.map(p => `
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--primary-blue)" stroke="#ffffff" stroke-width="2">
                <title>${p.label}: ${p.count.toLocaleString()} dấu trang</title>
            </circle>
            <text x="${p.x.toFixed(1)}" y="${svgHeight - 4}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${p.label}</text>
        `).join('');

        chartContainerEl.innerHTML = `
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: 100%; overflow: visible;">
                <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--primary-blue)" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="var(--primary-blue)" stop-opacity="0.0"/>
                    </linearGradient>
                </defs>
                <path d="${areaPath}" fill="url(#chartGradient)" />
                <path d="${linePath}" fill="none" stroke="var(--primary-blue)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                ${circles}
            </svg>
        `;
    }

    analyzeBookmarks();
});
