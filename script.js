// script.js
document.addEventListener('DOMContentLoaded', () => {
    const kmzFileInput = document.getElementById('kmz-file-input');
    const folderStructure = document.getElementById('folder-structure');
    const map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(map);

    kmzFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                showLoading();
                const kmzData = await readFileAsArrayBuffer(file);
                const kmz = await JSZip.loadAsync(kmzData);
                const kmlFile = await findKmlFile(kmz);
                const kmlContent = await kmz.file(kmlFile).async('text');
                const kmlDom = new DOMParser().parseFromString(kmlContent, 'text/xml');
                const tree = await buildTree(kmlDom, kmz);
                renderFolderStructure(tree, folderStructure);
                await renderKmlOnMap(kmlDom, kmz, map);
                hideLoading();
            } catch (error) {
                console.error('Error processing KMZ file:', error);
                alert('Failed to process KMZ file. Please check the console for details.');
                hideLoading();
            }
        }
    });

    async function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    async function findKmlFile(kmz) {
        for (const [name, file] of Object.entries(kmz.files)) {
            if (name.endsWith('.kml') && !file.dir) {
                return name;
            }
        }
        throw new Error('No KML file found in the KMZ archive.');
    }

    async function buildTree(kmlDom, kmz, parentPath = '') {
        const tree = { name: 'Root', children: [] };
        const networkLinks = kmlDom.getElementsByTagName('NetworkLink');
        for (const link of networkLinks) {
            const name = link.getElementsByTagName('name')[0]?.textContent || 'Unnamed Link';
            const href = link.getElementsByTagName('href')[0]?.textContent;
            if (href) {
                const fullPath = resolvePath(parentPath, href);
                const linkedKmlContent = await kmz.file(fullPath)?.async('text');
                if (linkedKmlContent) {
                    const linkedKmlDom = new DOMParser().parseFromString(linkedKmlContent, 'text/xml');
                    const childTree = await buildTree(linkedKmlDom, kmz, fullPath.split('/').slice(0, -1).join('/') + '/');
                    tree.children.push({ name, children: childTree.children, path: fullPath });
                }
            }
        }
        return tree;
    }

    function resolvePath(parentPath, href) {
        if (href.startsWith('../')) {
            const levelsUp = (href.match(/\.\.\//g) || []).length;
            const parentParts = parentPath.split('/').filter(Boolean);
            const resolvedPath = parentParts.slice(0, -levelsUp).join('/') + '/' + href.replace(/\.\.\//g, '');
            return resolvedPath;
        }
        return parentPath + href;
    }

    function renderFolderStructure(tree, container) {
        container.innerHTML = '';
        const renderNode = (node, parentElement) => {
            const div = document.createElement('div');
            div.className = node.children ? 'folder' : 'file';
            div.textContent = node.name;
            if (node.children) {
                div.addEventListener('click', () => {
                    const collapsible = div.nextElementSibling;
                    collapsible.classList.toggle('open');
                });
                const collapsible = document.createElement('div');
                collapsible.className = 'collapsible';
                node.children.forEach(child => renderNode(child, collapsible));
                div.appendChild(collapsible);
            } else if (node.path) {
                div.addEventListener('click', () => {
                    zoomToFeature(node.path);
                });
            }
            parentElement.appendChild(div);
        };
        renderNode(tree, container);
    }

    async function zoomToFeature(path) {
        const kmz = await JSZip.loadAsync(await readFileAsArrayBuffer(kmzFileInput.files[0]));
        const kmlContent = await kmz.file(path)?.async('text');
        if (kmlContent) {
            const kmlDom = new DOMParser().parseFromString(kmlContent, 'text/xml');
            const bounds = getKmlBounds(kmlDom);
            if (bounds) {
                map.fitBounds(bounds);
            }
        }
    }

    function getKmlBounds(kmlDom) {
        const latLonBox = kmlDom.getElementsByTagName('LatLonBox')[0];
        if (latLonBox) {
            return getLatLonBoxBounds(latLonBox);
        }
        return null;
    }

    async function renderKmlOnMap(kmlDom, kmz, map) {
        // Handle GroundOverlay
        const groundOverlays = kmlDom.getElementsByTagName('GroundOverlay');
        for (const overlay of groundOverlays) {
            const icon = overlay.getElementsByTagName('Icon')[0]?.getElementsByTagName('href')[0]?.textContent;
            const latLonBox = overlay.getElementsByTagName('LatLonBox')[0];
            if (icon && latLonBox) {
                const bounds = getLatLonBoxBounds(latLonBox);
                const imageUrl = await kmz.file(icon)?.async('base64');
                if (imageUrl && bounds) {
                    L.imageOverlay(`data:image/png;base64,${imageUrl}`, bounds).addTo(map);
                }
            }
        }

        // Handle NetworkLink recursively
        const networkLinks = kmlDom.getElementsByTagName('NetworkLink');
        for (const link of networkLinks) {
            const href = link.getElementsByTagName('href')[0]?.textContent;
            if (href) {
                const fullPath = resolvePath('', href);
                const linkedKmlContent = await kmz.file(fullPath)?.async('text');
                if (linkedKmlContent) {
                    const linkedKmlDom = new DOMParser().parseFromString(linkedKmlContent, 'text/xml');
                    await renderKmlOnMap(linkedKmlDom, kmz, map);
                }
            }
        }
    }

    function getLatLonBoxBounds(latLonBox) {
        const north = parseFloat(latLonBox.getElementsByTagName('north')[0]?.textContent);
        const south = parseFloat(latLonBox.getElementsByTagName('south')[0]?.textContent);
        const east = parseFloat(latLonBox.getElementsByTagName('east')[0]?.textContent);
        const west = parseFloat(latLonBox.getElementsByTagName('west')[0]?.textContent);
        if (!isNaN(north) && !isNaN(south) && !isNaN(east) && !isNaN(west)) {
            return L.latLngBounds([[south, west], [north, east]]);
        }
        return null;
    }

    function showLoading() {
        const loading = document.createElement('div');
        loading.id = 'loading';
        loading.textContent = 'Loading...';
        document.body.appendChild(loading);
    }

    function hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.remove();
        }
    }
});