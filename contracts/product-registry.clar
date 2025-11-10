(define-constant ERR-UNAUTHORIZED (err u1000))
(define-constant ERR-BATCH-EXISTS (err u1001))
(define-constant ERR-INVALID-HASH (err u1002))
(define-constant ERR-INVALID-DATE (err u1003))
(define-constant ERR-INVALID-TITLE (err u1004))
(define-constant ERR-INVALID-DESC (err u1005))
(define-constant ERR-INVALID-BATCH-SIZE (err u1006))
(define-constant ERR-INVALID-CERT-BODY (err u1007))
(define-constant ERR-INVALID-GEO (err u1008))
(define-constant ERR-INVALID-QUALITY (err u1009))
(define-constant ERR-CERT-NOT-FOUND (err u1010))
(define-constant ERR-UNCERTIFIED-BATCH (err u1011))
(define-constant ERR-EXPIRED-CERT (err u1012))
(define-constant ERR-MAX-BATCHES-EXCEEDED (err u1013))
(define-constant ERR-INVALID-FEE (err u1014))
(define-constant ERR-AUTHORITY-NOT-SET (err u1015))
(define-constant ERR-INVALID-UPDATE (err u1016))
(define-constant ERR-TRANSFER-FAILED (err u1017))
(define-data-var last-batch-id uint u0)
(define-data-var total-registrations uint u0)
(define-data-var max-batches uint u5000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-map batches 
    { batch-id: uint }
    {
        hash: (string-ascii 64),
        title: (string-ascii 100),
        description: (string-ascii 500),
        harvest-date: uint,
        batch-size: uint,
        cert-body: (string-ascii 50),
        geo-location: (string-ascii 100),
        quality-metric: uint,
        farmer: principal,
        certified: bool,
        cert-expiry: uint,
        created-at: uint,
        status: bool
    }
)
(define-map batch-owners 
    { batch-id: uint, owner-index: uint }
    principal
)
(define-map certifications 
    { batch-id: uint }
    {
        cert-hash: (string-ascii 64),
        issued-date: uint,
        expiry-date: uint,
        issuer: principal
    }
)
(define-map batch-updates 
    { batch-id: uint }
    {
        update-title: (string-ascii 100),
        update-desc: (string-ascii 500),
        update-timestamp: uint,
        updater: principal
    }
)
(define-read-only (get-batch (batch-id uint))
    (map-get? batches { batch-id: batch-id })
)
(define-read-only (get-total-registrations)
    (var-get total-registrations)
)
(define-read-only (get-batch-owners (batch-id uint))
    (map-get? batch-owners { batch-id: batch-id, owner-index: u0 })
)
(define-read-only (get-certification (batch-id uint))
    (map-get? certifications { batch-id: batch-id })
)
(define-read-only (is-batch-registered (batch-id uint))
    (is-some (get-batch batch-id))
)
(define-read-only (is-batch-certified (batch-id uint))
    (and (is-some (get-batch batch-id)) (get certified (unwrap-panic (get-batch batch-id))))
)
(define-private (validate-hash (h (string-ascii 64)))
    (if (is-eq (len h) u64) (ok true) (err ERR-INVALID-HASH))
)
(define-private (validate-title (t (string-ascii 100)))
    (if (and (> (len t) u0) (<= (len t) u100)) (ok true) (err ERR-INVALID-TITLE))
)
(define-private (validate-desc (d (string-ascii 500)))
    (if (and (> (len d) u0) (<= (len d) u500)) (ok true) (err ERR-INVALID-DESC))
)
(define-private (validate-date (dt uint))
    (if (> dt u0) (ok true) (err ERR-INVALID-DATE))
)
(define-private (validate-batch-size (bs uint))
    (if (and (> bs u0) (<= bs u10000)) (ok true) (err ERR-INVALID-BATCH-SIZE))
)
(define-private (validate-cert-body (cb (string-ascii 50)))
    (if (and (> (len cb) u0) (<= (len cb) u50)) (ok true) (err ERR-INVALID-CERT-BODY))
)
(define-private (validate-geo (g (string-ascii 100)))
    (if (and (> (len g) u0) (<= (len g) u100)) (ok true) (err ERR-INVALID-GEO))
)
(define-private (validate-quality (q uint))
    (if (<= q u100) (ok true) (err ERR-INVALID-QUALITY))
)
(define-private (validate-expiry (exp uint))
    (if (> exp block-height) (ok true) (err ERR-EXPIRED-CERT))
)
(define-private (validate-principal (p principal))
    (if (not (is-eq p tx-sender)) (ok true) (err ERR-UNAUTHORIZED))
)
(define-public (set-authority-contract (contract-principal principal))
    (begin
        (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (var-set authority-contract (some contract-principal))
        (ok true)
    )
)
(define-public (set-max-batches (new-max uint))
    (begin
        (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (asserts! (> new-max u0) (err ERR-MAX-BATCHES-EXCEEDED))
        (var-set max-batches new-max)
        (ok true)
    )
)
(define-public (set-registration-fee (new-fee uint))
    (begin
        (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
        (var-set registration-fee new-fee)
        (ok true)
    )
)
(define-public (register-batch 
    (hash (string-ascii 64))
    (title (string-ascii 100))
    (description (string-ascii 500))
    (harvest-date uint)
    (batch-size uint)
    (cert-body (string-ascii 50))
    (geo-location (string-ascii 100))
    (quality-metric uint)
)
    (let
        (
            (caller tx-sender)
            (new-id (var-get last-batch-id))
            (next-id (+ new-id u1))
            (current-max (var-get max-batches))
            (authority (unwrap! (var-get authority-contract) ERR-AUTHORITY-NOT-SET))
        )
        (asserts! (< next-id current-max) (err ERR-MAX-BATCHES-EXCEEDED))
        (try! (validate-hash hash))
        (try! (validate-title title))
        (try! (validate-desc description))
        (try! (validate-date harvest-date))
        (try! (validate-batch-size batch-size))
        (try! (validate-cert-body cert-body))
        (try! (validate-geo geo-location))
        (try! (validate-quality quality-metric))
        (asserts! (not (is-batch-registered next-id)) (err ERR-BATCH-EXISTS))
        (try! (stx-transfer? (var-get registration-fee) tx-sender authority))
        (map-set batches 
            { batch-id: next-id }
            {
                hash: hash,
                title: title,
                description: description,
                harvest-date: harvest-date,
                batch-size: batch-size,
                cert-body: cert-body,
                geo-location: geo-location,
                quality-metric: quality-metric,
                farmer: caller,
                certified: false,
                cert-expiry: u0,
                created-at: block-height,
                status: true
            }
        )
        (map-set batch-owners { batch-id: next-id, owner-index: u0 } caller)
        (var-set last-batch-id next-id)
        (var-set total-registrations (+ (var-get total-registrations) u1))
        (print { event: "batch-registered", id: next-id })
        (ok next-id)
    )
)
(define-public (certify-batch (batch-id uint) (cert-hash (string-ascii 64)) (expiry uint))
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (caller tx-sender)
        )
        (asserts! (not (get certified batch)) (err ERR-UNCERTIFIED-BATCH))
        (try! (validate-hash cert-hash))
        (try! (validate-expiry expiry))
        (map-set batches 
            { batch-id: batch-id }
            (merge batch { certified: true, cert-expiry: expiry })
        )
        (map-set certifications 
            { batch-id: batch-id }
            {
                cert-hash: cert-hash,
                issued-date: block-height,
                expiry-date: expiry,
                issuer: caller
            }
        )
        (ok true)
    )
)
(define-public (revoke-certification (batch-id uint))
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (cert (unwrap! (get-certification batch-id) ERR-CERT-NOT-FOUND))
            (caller tx-sender)
        )
        (asserts! (is-eq caller (get issuer cert)) (err ERR-UNAUTHORIZED))
        (asserts! (get certified batch) (err ERR-UNCERTIFIED-BATCH))
        (map-set batches 
            { batch-id: batch-id }
            (merge batch { certified: false, cert-expiry: u0 })
        )
        (map-delete certifications { batch-id: batch-id })
        (ok true)
    )
)
(define-public (update-batch 
    (batch-id uint)
    (update-title (string-ascii 100))
    (update-desc (string-ascii 500))
)
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (caller tx-sender)
        )
        (asserts! (is-eq caller (get farmer batch)) (err ERR-UNAUTHORIZED))
        (try! (validate-title update-title))
        (try! (validate-desc update-desc))
        (map-set batches 
            { batch-id: batch-id }
            {
                hash: (get hash batch),
                title: update-title,
                description: update-desc,
                harvest-date: (get harvest-date batch),
                batch-size: (get batch-size batch),
                cert-body: (get cert-body batch),
                geo-location: (get geo-location batch),
                quality-metric: (get quality-metric batch),
                farmer: (get farmer batch),
                certified: (get certified batch),
                cert-expiry: (get cert-expiry batch),
                created-at: (get created-at batch),
                status: (get status batch)
            }
        )
        (map-set batch-updates 
            { batch-id: batch-id }
            {
                update-title: update-title,
                update-desc: update-desc,
                update-timestamp: block-height,
                updater: caller
            }
        )
        (print { event: "batch-updated", id: batch-id })
        (ok true)
    )
)
(define-public (transfer-ownership (batch-id uint) (new-owner principal))
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (caller tx-sender)
            (current-owner (get farmer batch))
            (new-index (+ u1 (fold while (lambda (i uint) (+ i u1)) u0 (lambda (ignored uint) (map-get? batch-owners { batch-id: batch-id, owner-index: ignored })))))
        )
        (asserts! (is-eq caller current-owner) (err ERR-UNAUTHORIZED))
        (asserts! (is-eq (get status batch) true) (err ERR-INVALID-UPDATE))
        (map-set batch-owners { batch-id: batch-id, owner-index: new-index } new-owner)
        (map-set batches 
            { batch-id: batch-id }
            (merge batch { farmer: new-owner })
        )
        (ok true)
    )
)
(define-public (deactivate-batch (batch-id uint))
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (caller tx-sender)
        )
        (asserts! (is-eq caller (get farmer batch)) (err ERR-UNAUTHORIZED))
        (map-set batches 
            { batch-id: batch-id }
            (merge batch { status: false })
        )
        (ok true)
    )
)
(define-read-only (get-batch-updates (batch-id uint))
    (map-get? batch-updates { batch-id: batch-id })
)
(define-public (get-batch-count)
    (ok (var-get last-batch-id))
)
(define-public (check-batch-existence (batch-id uint))
    (ok (is-batch-registered batch-id))
)
(define-public (check-cert-status (batch-id uint))
    (let
        (
            (batch (unwrap! (get-batch batch-id) ERR-BATCH-EXISTS))
            (cert (get-certification batch-id))
        )
        (if (and (get certified batch) (is-some cert) (<= block-height (get expiry-date (unwrap-panic cert))))
            (ok true)
            (err ERR-EXPIRED-CERT)
        )
    )
)