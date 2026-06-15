/**
 * Google Apps Script Web App URL (for submission)
 */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwKZoWmYZLoeM0rW0eHXMQepWRw66wGqCjPWJpQF29JvrfW-bbkoG5vqDMY4XZJQ08vyQ/exec';

/**
 * Google Sheets Configuration (for lookup)
 */
const SPREADSHEET_ID = '1Eux9biqPW5DSGpsNTaqDCQQB2It4qSphQQKdJ2iPumY';
const SHEET_NAME = '근태이슈_DB';
const SHEETS_API_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('attendanceForm');
    const submitBtn = form.querySelector('.submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');

    // Populate time select options
    const startHourSelect = document.getElementById('startHour');
    const startMinuteSelect = document.getElementById('startMinute');
    const endHourSelect = document.getElementById('endHour');
    const endMinuteSelect = document.getElementById('endMinute');

    // Generate hours (00-23)
    for (let i = 0; i < 24; i++) {
        const hour = String(i).padStart(2, '0');
        startHourSelect.add(new Option(hour, hour));
        endHourSelect.add(new Option(hour, hour));
    }

    // Generate minutes (00, 10, 20, 30, 40, 50)
    [0, 10, 20, 30, 40, 50].forEach(min => {
        const minute = String(min).padStart(2, '0');
        startMinuteSelect.add(new Option(minute, minute));
        endMinuteSelect.add(new Option(minute, minute));
    });

    // Set default date and time to today
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    const currentHour = String(today.getHours()).padStart(2, '0');
    const currentMinute = String(Math.floor(today.getMinutes() / 10) * 10).padStart(2, '0');

    if (startDateInput) startDateInput.value = dateString;
    if (endDateInput) endDateInput.value = dateString;

    // Set default time
    startHourSelect.value = currentHour;
    startMinuteSelect.value = currentMinute;
    endHourSelect.value = currentHour;
    endMinuteSelect.value = currentMinute;

    // 근태 발생 일자가 변경되면 종료 일자의 최소값을 발생 일자로 설정
    startDateInput.addEventListener('change', function () {
        const startDate = this.value;
        endDateInput.min = startDate;

        // 만약 현재 종료 일자가 발생 일자보다 빠르면 자동으로 발생 일자와 같게 설정
        if (endDateInput.value && endDateInput.value < startDate) {
            endDateInput.value = startDate;
        }
    });

    // 초기 로드 시에도 최소값 설정
    if (startDateInput.value) {
        endDateInput.min = startDateInput.value;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // 근태구분 확인
        const attendanceType = document.getElementById('type').value;

        // 중복 체크: 근태구분이 '취소'가 아닐 때만 체크
        if (attendanceType !== '취소') {
            const name = document.getElementById('name').value.trim();
            const startDate = document.getElementById('startDate').value;
            const key = `attendance_${name}_${startDate}`;

            // localStorage에 저장된 기록 확인
            const existingRecord = localStorage.getItem(key);
            if (existingRecord) {
                showNotification('이미 해당 날짜에 근태계가 존재하므로, 취소 근태계를 먼저 작성해주십시오.', 'error');
                return;
            }
        }

        // Show confirmation modal
        showConfirmModal();
    });

    // Confirm Modal Logic
    const confirmModal = document.getElementById('confirmModal');
    const confirmSubmitBtn = document.getElementById('confirmSubmit');
    const cancelSubmitBtn = document.getElementById('cancelSubmit');

    function formatDateKorean(dateString) {
        // "2025-12-01" -> "2025년 12월 1일"
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}년 ${month}월 ${day}일`;
    }

    function formatTimeKorean(hour, minute) {
        // "14:30" -> "오후 2시 30분"
        const h = parseInt(hour);
        const m = parseInt(minute);
        const period = h < 12 ? '오전' : '오후';
        const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        return `${period} ${displayHour}시 ${m.toString().padStart(2, '0')}분`;
    }

    function showConfirmModal() {
        // Collect form data for display
        const department = document.getElementById('department').value;
        const name = document.getElementById('name').value;
        const startDate = document.getElementById('startDate').value;
        const startHour = document.getElementById('startHour').value;
        const startMinute = document.getElementById('startMinute').value;
        const endDate = document.getElementById('endDate').value;
        const endHour = document.getElementById('endHour').value;
        const endMinute = document.getElementById('endMinute').value;
        const type = document.getElementById('type').value;

        // Format dates and times in Korean
        const startDateKorean = formatDateKorean(startDate);
        const startTimeKorean = formatTimeKorean(startHour, startMinute);
        const endDateKorean = formatDateKorean(endDate);
        const endTimeKorean = formatTimeKorean(endHour, endMinute);

        // Display data in modal
        document.getElementById('confirmDepartment').textContent = department;
        document.getElementById('confirmName').textContent = name;

        const confirmStartDateEl = document.getElementById('confirmStartDate');
        confirmStartDateEl.textContent = startDateKorean;
        confirmStartDateEl.classList.add('date-time');

        const confirmStartTimeEl = document.getElementById('confirmStartTime');
        confirmStartTimeEl.textContent = startTimeKorean;
        confirmStartTimeEl.classList.add('date-time');

        const confirmEndDateEl = document.getElementById('confirmEndDate');
        confirmEndDateEl.textContent = endDateKorean;
        confirmEndDateEl.classList.add('date-time');

        const confirmEndTimeEl = document.getElementById('confirmEndTime');
        confirmEndTimeEl.textContent = endTimeKorean;
        confirmEndTimeEl.classList.add('date-time');

        document.getElementById('confirmType').textContent = type;

        // Show modal
        confirmModal.classList.remove('hidden');
    }

    function hideConfirmModal() {
        confirmModal.classList.add('hidden');
    }

    // Cancel button - just close modal
    cancelSubmitBtn.addEventListener('click', hideConfirmModal);

    // Confirm button - proceed with submission
    confirmSubmitBtn.addEventListener('click', async () => {
        hideConfirmModal();
        await submitForm();
    });

    // Close modal when clicking outside
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            hideConfirmModal();
        }
    });

    async function submitForm() {
        // UI: Loading State
        setLoading(true);
        hideNotification();

        // Collect Data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Combine hour and minute into time format
        data.startTime = `${data.startHour}:${data.startMinute}`;
        data.endTime = `${data.endHour}:${data.endMinute}`;

        // Remove individual hour/minute fields
        delete data.startHour;
        delete data.startMinute;
        delete data.endHour;
        delete data.endMinute;

        try {
            if (SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
                throw new Error('Backend URL not configured. Please set the SCRIPT_URL in script.js.');
            }

            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            // Since mode is 'no-cors', we can't read the response
            // Assume success if no error was thrown

            // localStorage에 기록 저장 (중복 체크용)
            const name = data.name.trim();
            const startDate = data.startDate;
            const key = `attendance_${name}_${startDate}`;

            // 근태구분이 '취소'인 경우, 기존 기록 삭제
            if (data.type === '취소') {
                localStorage.removeItem(key);
            } else {
                // 그 외의 경우 저장
                localStorage.setItem(key, JSON.stringify({
                    name: name,
                    date: startDate,
                    type: data.type,
                    timestamp: new Date().toISOString()
                }));
            }

            showNotification('제출이 완료되었습니다! 감사합니다.', 'success');
            form.reset();

            // Reset to default values
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            const today = new Date();
            const dateString = today.toISOString().split('T')[0];
            const currentHour = String(today.getHours()).padStart(2, '0');
            const currentMinute = String(Math.floor(today.getMinutes() / 10) * 10).padStart(2, '0');

            startDateInput.value = dateString;
            endDateInput.value = dateString;
            startHourSelect.value = currentHour;
            startMinuteSelect.value = currentMinute;
            endHourSelect.value = currentHour;
            endMinuteSelect.value = currentMinute;

        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message || '제출 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnText.style.display = 'none';
            loader.style.display = 'inline-block';
            submitBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            loader.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    function showNotification(message, type) {
        notificationMessage.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
    }

    function hideNotification() {
        notification.classList.add('hidden');
    }

    // ===== Tab Switching =====
    const tabBtns = document.querySelectorAll('.tab-btn');
    const submitSection = document.getElementById('submitSection');
    const lookupSection = document.getElementById('lookupSection');
    const headerDescription = document.getElementById('headerDescription');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch sections
            if (tab === 'submit') {
                submitSection.classList.remove('hidden');
                submitSection.classList.add('active');
                lookupSection.classList.remove('active');
                lookupSection.classList.add('hidden');
                headerDescription.textContent = '정확한 근태 관리를 위해 특이사항을 입력해 주세요.';
            } else if (tab === 'lookup') {
                lookupSection.classList.remove('hidden');
                lookupSection.classList.add('active');
                submitSection.classList.remove('active');
                submitSection.classList.add('hidden');
                headerDescription.textContent = '소속과 성명을 입력하여 근태 신청 내역을 조회하세요.';
            }
        });
    });

    // ===== Lookup Functionality =====
    const lookupForm = document.getElementById('lookupForm');
    const statsContainer = document.getElementById('statsContainer');
    const tableContainer = document.getElementById('tableContainer');
    const recordsTableBody = document.getElementById('recordsTableBody');
    const annualLeaveCount = document.getElementById('annualLeaveCount');
    const halfLeaveCount = document.getElementById('halfLeaveCount');
    const noRecords = document.getElementById('noRecords');

    lookupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const department = document.getElementById('lookupDepartment').value;
        const name = document.getElementById('lookupName').value;

        // 디버깅: 요소 존재 확인
        const startDateElement = document.getElementById('lookupStartDate');
        const endDateElement = document.getElementById('lookupEndDate');

        console.log('Date elements:', {
            startDateElement: startDateElement,
            endDateElement: endDateElement,
            startDateExists: !!startDateElement,
            endDateExists: !!endDateElement
        });

        const startDateStr = startDateElement ? startDateElement.value : '';
        const endDateStr = endDateElement ? endDateElement.value : '';

        const lookupBtn = lookupForm.querySelector('.lookup-btn');
        const btnText = lookupBtn.querySelector('.btn-text');
        const loader = lookupBtn.querySelector('.loader');

        // Show loading state
        btnText.style.display = 'none';
        loader.style.display = 'inline-block';
        lookupBtn.disabled = true;

        // Hide previous results
        statsContainer.classList.add('hidden');
        tableContainer.classList.add('hidden');

        try {
            // Google Sheets Visualization API 호출
            const response = await fetch(SHEETS_API_URL);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();

            // Google Visualization API 응답 파싱
            // 응답 형식: google.visualization.Query.setResponse({...})
            const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/);
            if (!jsonMatch) {
                throw new Error('Invalid response format from Google Sheets');
            }

            const jsonData = JSON.parse(jsonMatch[1]);

            if (jsonData.status === 'error') {
                throw new Error(jsonData.errors[0].detailed_message || 'Google Sheets API error');
            }

            // 데이터 추출 및 변환
            const rows = jsonData.table.rows;
            const currentYear = new Date().getFullYear();

            console.log('Total rows:', rows.length);

            // 첫 번째 행의 모든 컬럼 출력
            if (rows.length > 0) {
                const firstRow = rows[0].c;
                console.log('=== First row all columns ===');
                firstRow.forEach((cell, index) => {
                    const columnLetter = String.fromCharCode(65 + index);
                    console.log(`Column ${index} (${columnLetter}):`, cell?.v || cell?.f || 'null');
                });
                console.log('=== End of columns ===');
            }

            const allRecords = rows.map((row, index) => {
                const cells = row.c;

                return {
                    submitDate: cells[0]?.f || cells[0]?.v || '',  // A: 접수일자
                    department: cells[1]?.v || '',                  // B: 소속
                    position: cells[2]?.v || '',                    // C: 직위
                    name: cells[3]?.v || '',                        // D: 성명
                    startDate: cells[4]?.f || cells[4]?.v || '',   // E: 근태발생일자
                    endDate: cells[5]?.f || cells[5]?.v || '',     // F: 근태종료일자
                    type: cells[6]?.v || '',                        // G: 근태구분
                    description: cells[7]?.v || '',                 // H: 근태사유
                    reviewStatus: cells[8]?.v || '',                // I: 검토상태
                    approvalStatus: cells[10]?.v || ''              // K: 승인상태 (J열 건너뜀)
                };
            });

            // 날짜 범위 객체 생성
            console.log('Input values:', { startDateStr, endDateStr });

            const startDate = startDateStr ? new Date(startDateStr) : null;
            const endDate = endDateStr ? new Date(endDateStr) : null;
            // 종료일은 23:59:59까지 포함하도록 설정
            if (endDate) {
                endDate.setHours(23, 59, 59, 999);
            }

            console.log('Date filter:', { startDate, endDate });

            // 필터링: 소속, 성명, 날짜 범위
            const filteredRecords = allRecords.filter(record => {
                if (record.department !== department || record.name !== name) {
                    return false;
                }

                // 날짜 범위 필터링
                if (startDate || endDate) {
                    const recordDate = parseKoreanDate(record.startDate);

                    // 날짜 파싱 실패 시 제외
                    if (!recordDate) {
                        console.log('Failed to parse date:', record.startDate);
                        return false;
                    }

                    // 디버깅: 파싱된 날짜 출력
                    console.log('Record:', {
                        name: record.name,
                        type: record.type,
                        startDate: record.startDate,
                        parsedDate: recordDate.toISOString().split('T')[0],
                        filterStart: startDate ? startDate.toISOString().split('T')[0] : 'none',
                        filterEnd: endDate ? endDate.toISOString().split('T')[0] : 'none'
                    });

                    if (startDate && recordDate < startDate) {
                        console.log('→ Filtered out: before start date');
                        return false;
                    }
                    if (endDate && recordDate > endDate) {
                        console.log('→ Filtered out: after end date');
                        return false;
                    }

                    console.log('→ Included');
                }

                return true;
            });

            if (filteredRecords && filteredRecords.length > 0) {
                // Calculate leave counts
                let annualCount = 0;
                let halfCount = 0;

                filteredRecords.forEach(record => {
                    if (record.type === '연차') annualCount++;
                    if (record.type === '반차') halfCount++;
                });

                // Update stats
                annualLeaveCount.textContent = annualCount;
                halfLeaveCount.textContent = halfCount;
                statsContainer.classList.remove('hidden');

                // Render table
                renderRecordsTable(filteredRecords);
                tableContainer.classList.remove('hidden');
                noRecords.classList.add('hidden');
            } else {
                // No records found
                statsContainer.classList.add('hidden');
                tableContainer.classList.remove('hidden');
                recordsTableBody.innerHTML = '';
                noRecords.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Lookup error:', error);
            alert('조회 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
            // Reset button state
            btnText.style.display = 'inline';
            loader.style.display = 'none';
            lookupBtn.disabled = false;
        }
    });

    function renderRecordsTable(records) {
        recordsTableBody.innerHTML = '';

        records.forEach(record => {
            const row = document.createElement('tr');

            // Format date
            const dateStr = formatDate(record.startDate, record.endDate);

            // Get status badges
            const reviewBadge = getStatusBadge(record.reviewStatus);
            const approvalBadge = getStatusBadge(record.approvalStatus);

            row.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${record.type}</strong></td>
                <td>${reviewBadge}</td>
                <td>${approvalBadge}</td>
            `;

            recordsTableBody.appendChild(row);
        });
    }

    // 한국어 날짜 형식 파싱 함수
    function parseKoreanDate(dateStr) {
        if (!dateStr) return null;

        // 문자열로 변환
        const str = String(dateStr);

        // "Date(2025,10,2,17,0)" 형식 파싱 (Google Sheets API 형식)
        // 주의: 월(month)은 0-based (0=1월, 11=12월)
        let match = str.match(/Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]); // 이미 0-based이므로 그대로 사용
            const day = parseInt(match[3]);
            return new Date(year, month, day);
        }

        // "2025. 11. 6 오후 5:00:00" 형식 파싱
        match = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // 0-based
            const day = parseInt(match[3]);
            return new Date(year, month, day);
        }

        // "2025-11-28 8:00:00" 형식 파싱 (시간 포함, 초 포함)
        match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // 0-based
            const day = parseInt(match[3]);
            return new Date(year, month, day);
        }

        // "2025-12-05 9:00" 또는 "2025-12-05" 형식 파싱
        match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // 0-based
            const day = parseInt(match[3]);
            return new Date(year, month, day);
        }

        // 일반 날짜 형식 시도
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
            return date;
        }

        return null;
    }

    function formatDate(startDate, endDate) {
        const start = parseKoreanDate(startDate);
        const end = parseKoreanDate(endDate);

        // 날짜 파싱 실패 시 원본 반환
        if (!start || !end) {
            return startDate || '';
        }

        const formatSingle = (date) => {
            const year = String(date.getFullYear()).slice(-2); // 2025 → 25
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${year}.${month}.${day}`;
        };

        if (startDate === endDate) {
            return formatSingle(start);
        } else {
            return `${formatSingle(start)} ~ ${formatSingle(end)}`;
        }
    }

    function getStatusBadge(status) {
        // 정확히 '승인'일 때만 'O' 표시
        if (status && status.trim() === '승인') {
            return '<span class="status-badge status-approved">O</span>';
        }

        // 그 외 모든 경우 '-' 표시
        return '<span class="status-badge status-none">-</span>';
    }

    // 페이지 로드 시 날짜 기본값 설정 (빈 값으로 변경)
    // 사용자가 직접 날짜를 선택하도록 함
    // document.getElementById('startDate').value = '';
    // document.getElementById('endDate').value = '';
});