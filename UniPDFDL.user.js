// ==UserScript==
// @name        Universal PDF Downloader (PubHTML5 & AnyFlip) by g0d
// @namespace   http://tampermonkey.net/
// @version     1.3
// @description ดาวน์โหลดสื่อ
// @author      g0d
// @match       https://online.pubhtml5.com/*
// @match       https://online.anyflip.com/*
// @grant       GM_xmlhttpRequest
// @require     https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js
// @downloadURL https://github.com/dev-g0d/UniPDF/raw/refs/heads/main/UniPDFDL.user.js
// @updateURL https://github.com/dev-g0d/UniPDF/raw/refs/heads/main/UniPDFDL.user.js
// ==/UserScript==

(function() {
    'use strict';

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        console.error("Error: ไม่พบไลบรารี jsPDF");
        alert("ไม่สามารถโหลดไลบรารีสร้าง PDF ได้");
        return;
    }

    let PAGE_BASE_URL_TEMPLATE = "";
    const START_PAGE = 1;

    const currentUrl = window.location.href;

    if (currentUrl.includes("online.pubhtml5.com")) {
        const match = currentUrl.match(/(https:\/\/online\.pubhtml5\.com\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\/)/);
        if (match && match[1]) {
            PAGE_BASE_URL_TEMPLATE = match[1] + "files/large/";
        } else {
            console.error("ไม่สามารถระบุ Base URL ของ PubHTML5 ได้:", currentUrl);
            return;
        }
    } else if (currentUrl.includes("online.anyflip.com")) {
        const match = currentUrl.match(/(https:\/\/online\.anyflip\.com\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\/)/);
        if (match && match[1]) {
            PAGE_BASE_URL_TEMPLATE = match[1] + "files/mobile/";
        } else {
            console.error("ไม่สามารถระบุ Base URL ของ AnyFlip ได้:", currentUrl);
            return;
        }
    } else {
        return;
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    let currentProgressOverlay = null;
    let currentProgressText = null;
    let currentProgressBar = null;

    function showProgressOverlay(initialText = 'กำลังโหลด...') {
        if (currentProgressOverlay) return;

        currentProgressOverlay = document.createElement('div');
        currentProgressOverlay.id = 'pdf-progress-overlay';
        currentProgressOverlay.style.position = 'fixed';
        currentProgressOverlay.style.top = '0';
        currentProgressOverlay.style.left = '0';
        currentProgressOverlay.style.width = '100%';
        currentProgressOverlay.style.height = '100%';
        currentProgressOverlay.style.background = 'rgba(0,0,0,0.7)';
        currentProgressOverlay.style.color = 'white';
        currentProgressOverlay.style.display = 'flex';
        currentProgressOverlay.style.flexDirection = 'column';
        currentProgressOverlay.style.justifyContent = 'center';
        currentProgressOverlay.style.alignItems = 'center';
        currentProgressOverlay.style.zIndex = '99999';
        currentProgressOverlay.style.fontSize = '20px';
        currentProgressOverlay.style.textAlign = 'center';
        document.body.appendChild(currentProgressOverlay);

        currentProgressText = document.createElement('div');
        currentProgressText.innerText = initialText;
        currentProgressOverlay.appendChild(currentProgressText);

        const progressBarContainer = document.createElement('div');
        progressBarContainer.style.width = '80%';
        progressBarContainer.style.background = '#ccc';
        progressBarContainer.style.borderRadius = '5px';
        progressBarContainer.style.marginTop = '10px';
        currentProgressOverlay.appendChild(progressBarContainer);

        currentProgressBar = document.createElement('div');
        currentProgressBar.style.width = '0%';
        currentProgressBar.style.height = '20px';
        currentProgressBar.style.background = '#4CAF50';
        currentProgressBar.style.borderRadius = '5px';
        currentProgressBar.style.textAlign = 'center';
        currentProgressBar.style.lineHeight = '20px';
        currentProgressBar.innerText = '0%';
        progressBarContainer.appendChild(currentProgressBar);
    }

    function updateProgress(text, percentage = null) {
        if (currentProgressText) {
            currentProgressText.innerText = text;
        }
        if (currentProgressBar && percentage !== null) {
            currentProgressBar.style.width = `${percentage}%`;
            currentProgressBar.innerText = `${Math.round(percentage)}%`;
        }
    }

    function hideProgressOverlay() {
        if (currentProgressOverlay) {
            currentProgressOverlay.remove();
            currentProgressOverlay = null;
            currentProgressText = null;
            currentProgressBar = null;
        }
    }

    async function fetchImageUrls(baseUrl, startPage) {
        const imageUrls = [];
        let currentPage = startPage;
        let is403 = false;
        let foundImageExtension = null;

        updateProgress(`กำลังสแกนหาหน้า (JPG)... หน้าที่ ${currentPage}`);

        while (!is403) {
            const imageUrl = `${baseUrl}${currentPage}.jpg`;
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: imageUrl,
                        responseType: "arraybuffer",
                        onload: resolve,
                        onerror: reject
                    });
                });

                if (response.status === 403) {
                    is403 = true;
                } else if (response.status >= 200 && response.status < 300) {
                    imageUrls.push(imageUrl);
                    foundImageExtension = '.jpg';
                } else {
                    console.warn(`สถานะ ${response.status} สำหรับ ${imageUrl} ไม่คาดคิด กำลังลอง .png...`);
                    break;
                }
            } catch (error) {
                console.error(`ข้อผิดพลาดในการดึง ${imageUrl}:`, error);
                break;
            }
            currentPage++;
            updateProgress(`กำลังสแกนหาหน้า (JPG)... หน้าที่ ${currentPage}`);
        }

        if (imageUrls.length === 0 || foundImageExtension === null) {
            currentPage = startPage;
            is403 = false;
            updateProgress(`กำลังสแกนหาหน้า (PNG)... หน้าที่ ${currentPage}`);
            while (!is403) {
                const imageUrl = `${baseUrl}${currentPage}.png`;
                try {
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: imageUrl,
                            responseType: "arraybuffer",
                            onload: resolve,
                            onerror: reject
                        });
                    });

                    if (response.status === 403) {
                        is403 = true;
                    } else if (response.status >= 200 && response.status < 300) {
                        imageUrls.push(imageUrl);
                        foundImageExtension = '.png';
                    } else {
                        console.warn(`สถานะ ${response.status} สำหรับ ${imageUrl} ไม่คาดคิด กำลังหยุด.`);
                        break;
                    }
                } catch (error) {
                    console.error(`ข้อผิดพลาดในการดึง ${imageUrl}:`, error);
                    break;
                }
                currentPage++;
                updateProgress(`กำลังสแกนหาหน้า (PNG)... หน้าที่ ${currentPage}`);
            }
        }
        return imageUrls;
    }

    async function createPdfFromImages(imageUrls, filename = 'document.pdf') {
        const { jsPDF } = window.jspdf;
        let pdf;

        updateProgress('กำลังเตรียมสร้างไฟล์ PDF...');

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            const progress = ((i + 1) / imageUrls.length) * 100;
            updateProgress(`กำลังดาวน์โหลด ${i + 1}/${imageUrls.length}...`, progress);

            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: imageUrl,
                        responseType: "arraybuffer",
                        onload: resolve,
                        onerror: reject
                    });
                });

                const base64Image = arrayBufferToBase64(response.response);
                let imageFormat = imageUrl.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';

                const imgData = `data:image/${imageFormat.toLowerCase()};base64,${base64Image}`;

                const img = new Image();
                await new Promise((resolve) => {
                    img.onload = () => resolve();
                    img.src = imgData;
                });

                const imgWidth = img.width;
                const imgHeight = img.height;

                if (!pdf) {
                    pdf = new jsPDF({
                        orientation: imgWidth > imgHeight ? 'l' : 'p',
                        unit: 'pt',
                        format: [imgWidth, imgHeight]
                    });
                } else {
                    pdf.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'l' : 'p');
                }

                pdf.addImage(imgData, imageFormat, 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
            } catch (error) {
                console.error(`ข้อผิดพลาดในการประมวลผลรูปภาพ ${imageUrl}:`, error);
                updateProgress(`เกิดข้อผิดพลาดในการประมวลผลรูปภาพที่ ${i + 1}/${imageUrls.length} โปรดดู Console.`, progress);
                if (currentProgressBar) currentProgressBar.style.background = 'red';
                await new Promise(r => setTimeout(r, 3000));
                hideProgressOverlay();
                return;
            }
        }

        updateProgress('กำลังสร้างไฟล์ PDF...', 100);
        const pdfBlob = pdf.output('blob');
        downloadBlob(pdfBlob, filename);

        updateProgress('ดาวน์โหลดสำเร็จ!', 100);
        await new Promise(r => setTimeout(r, 1500));
        hideProgressOverlay();
    }

    function addFloatingBubble() {
        const bubbleButton = document.createElement('button');
        bubbleButton.id = 'pdf-bubble-button';
        bubbleButton.innerText = 'PDF';
        bubbleButton.style.position = 'fixed';
        bubbleButton.style.bottom = '20px';
        bubbleButton.style.right = '20px';
        bubbleButton.style.backgroundColor = '#4CAF50';
        bubbleButton.style.color = 'white';
        bubbleButton.style.border = 'none';
        bubbleButton.style.borderRadius = '50%';
        bubbleButton.style.width = '60px';
        bubbleButton.style.height = '60px';
        bubbleButton.style.fontSize = '20px';
        bubbleButton.style.cursor = 'pointer';
        bubbleButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        bubbleButton.style.zIndex = '9999';
        bubbleButton.style.transition = 'background-color 0.3s ease';

        bubbleButton.onmouseover = () => bubbleButton.style.backgroundColor = '#45a049';
        bubbleButton.onmouseout = () => bubbleButton.style.backgroundColor = '#4CAF50';

        document.body.appendChild(bubbleButton);

        const popupContainer = document.createElement('div');
        popupContainer.id = 'pdf-filename-popup';
        popupContainer.style.position = 'fixed';
        popupContainer.style.top = '50%';
        popupContainer.style.left = '50%';
        popupContainer.style.transform = 'translate(-50%, -50%)';
        popupContainer.style.background = 'white';
        popupContainer.style.padding = '25px';
        popupContainer.style.borderRadius = '10px';
        popupContainer.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        popupContainer.style.zIndex = '10000';
        popupContainer.style.display = 'none';
        popupContainer.style.fontFamily = 'Arial, sans-serif';
        popupContainer.style.border = '1px solid #ddd';

        popupContainer.innerHTML = `
            <h3 style="margin-top: 0; color: #333;">บันทึกเป็น PDF</h3>
            <label for="pdfFileNameInput" style="display: block; margin-bottom: 8px; color: #555;">ชื่อไฟล์:</label>
            <input type="text" id="pdfFileNameInput" value="book.pdf" style="width: calc(100% - 20px); padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 5px; font-size: 16px;">
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancelPdfBtn" style="padding: 10px 20px; background-color: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">ยกเลิก</button>
                <button id="confirmPdfBtn" style="padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">ดาวน์โหลด</button>
            </div>
        `;
        document.body.appendChild(popupContainer);

        bubbleButton.addEventListener('click', () => {
            if (!PAGE_BASE_URL_TEMPLATE) {
                alert("ไม่สามารถระบุ Base URL ของรูปภาพหนังสือได้ สคริปต์อาจทำงานไม่ถูกต้อง");
                return;
            }
            popupContainer.style.display = 'block';
            document.getElementById('pdfFileNameInput').focus();
        });

        document.getElementById('cancelPdfBtn').addEventListener('click', () => {
            popupContainer.style.display = 'none';
        });

        document.getElementById('confirmPdfBtn').addEventListener('click', async () => {
            const pdfFileName = document.getElementById('pdfFileNameInput').value.trim();
            if (!pdfFileName) {
                alert('กรุณาใส่ชื่อไฟล์');
                return;
            }
            popupContainer.style.display = 'none';

            showProgressOverlay('กำลังสแกนหาหน้า...');

            const imageUrls = await fetchImageUrls(PAGE_BASE_URL_TEMPLATE, START_PAGE);
            if (imageUrls.length === 0) {
                hideProgressOverlay();
                alert('ไม่พบรูปภาพที่ถูกต้อง โปรดตรวจสอบ URL หรือ Console สำหรับข้อผิดพลาด');
                return;
            }

            await createPdfFromImages(imageUrls, pdfFileName);
        });

        document.getElementById('pdfFileNameInput').addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                document.getElementById('confirmPdfBtn').click();
            }
        });
    }

    window.addEventListener('load', addFloatingBubble);
})();
