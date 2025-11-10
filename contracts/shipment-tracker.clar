;; shipment-tracker.clar
(define-constant ERR-UNAUTHORIZED (err u2000))
(define-constant ERR-BATCH-NOT-FOUND (err u2001))
(define-constant ERR-INVALID-SHIPMENT-ID (err u2002))
(define-constant ERR-INVALID-ORIGIN (err u2003))
(define-constant ERR-INVALID-DESTINATION (err u2004))
(define-constant ERR-INVALID-TIMESTAMP (err u2005))
(define-constant ERR-INVALID-GEO (err u2006))
(define-constant ERR-SHIPMENT-ALREADY-EXISTS (err u2007))
(define-constant ERR-SHIPMENT-NOT-EXISTS (err u2008))
(define-constant ERR-INSUFFICIENT-APPROVALS (err u2009))
(define-constant ERR-MAX-APPROVERS-EXCEEDED (err u2010))
(define-constant ERR-INVALID-APPROVER (err u2011))
(define-constant ERR-APPROVAL-ALREADY-GIVEN (err u2012))
(define-constant ERR-APPROVAL-NOT-FOUND (err u2013))
(define-constant ERR-INVALID-FEE (err u2014))
(define-constant ERR-AUTHORITY-NOT-SET (err u2015))
(define-constant ERR-TRANSFER-INVALID (err u2016))
(define-data-var last-shipment-id uint u0)
(define-data-var total-shipments uint u0)
(define-data-var max-shipments uint u10000)
(define-data-var shipment-fee uint u200)
(define-data-var authority-contract (optional principal) none)
(define-map shipments 
    { shipment-id: uint }
    {
        batch-id: uint,
        origin: principal,
        destination: principal,
        start-timestamp: uint,
        geo-start: (string-ascii 100),
        status: (string-ascii 20),
        created-at: uint
    }
)
(define-map shipment-approvals 
    { shipment-id: uint, approver-index: uint }
    principal
)
(define-map approvals-given 
    { shipment-id: uint, approver: principal }
    bool
)
(define-map shipment-updates 
    { shipment-id: uint }
    {
        update-geo: (string-ascii 100),
        update-timestamp: uint,
        updater: principal
    }
)
(define-read-only (get-shipment (shipment-id uint))
    (map-get? shipments { shipment-id: shipment-id })
)
(define-read-only (get-total-shipments)
    (var-get total-shipments)
)
(define-read-only (get-shipment-approvals (shipment-id uint))
    (map-get? shipment-approvals { shipment-id: shipment-id, approver-index: u0 })
)
(define-read-only (is-approval-given (shipment-id uint) (approver principal))
    (default-to false (map-get? approvals-given { shipment-id: shipment-id, approver: approver }))
)
(define-read-only (is-shipment-active (shipment-id uint))
    (let ((shipment (unwrap-panic (get-shipment shipment-id))))
        (is-eq (get status shipment) "active")
    )
)
(define-private (validate-principal (p principal))
    (if (not (is-eq p tx-sender)) (ok true) (err ERR-UNAUTHORIZED))
)
(define-private (validate-origin (o principal))
    (if (is-standard principal-type o) (ok true) (err ERR-INVALID-ORIGIN))
)
(define-private (validate-destination (d principal))
    (if (is-standard principal-type d) (ok true) (err ERR-INVALID-DESTINATION))
)
(define-private (validate-timestamp (ts uint))
    (if (>= ts block-height) (ok true) (err ERR-INVALID-TIMESTAMP))
)
(define-private (validate-geo (g (string-ascii 100)))
    (if (and (> (len g) u0) (<= (len g) u100)) (ok true) (err ERR-INVALID-GEO))
)
(define-private (validate-status (s (string-ascii 20)))
    (if (or (is-eq s "active") (is-eq s "in-transit") (is-eq s "delivered") (is-eq s "disputed")) (ok true) (err ERR-INVALID-SHIPMENT-ID))
)
(define-public (set-authority-contract (contract-principal principal))
    (begin
        (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (var-set authority-contract (some contract-principal))
        (ok true)
    )
)
(define-public (set-max-shipments (new-max uint))
    (begin
        (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (asserts! (> new-max u0) (err ERR-MAX-APPROVERS-EXCEEDED))
        (var-set max-shipments new-max)
        (ok true)
    )
)
(define-public (set-shipment-fee (new-fee uint))
    (begin
        (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
        (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
        (var-set shipment-fee new-fee)
        (ok true)
    )
)
(define-public (initiate-shipment 
    (batch-id uint)
    (destination principal)
    (start-timestamp uint)
    (geo-start (string-ascii 100))
)
    (let
        (
            (caller tx-sender)
            (new-id (var-get last-shipment-id))
            (next-id (+ new-id u1))
            (current-max (var-get max-shipments))
            (authority (unwrap! (var-get authority-contract) ERR-AUTHORITY-NOT-SET))
        )
        (asserts! (< next-id current-max) (err ERR-MAX-APPROVERS-EXCEEDED))
        (try! (validate-origin caller))
        (try! (validate-destination destination))
        (try! (validate-timestamp start-timestamp))
        (try! (validate-geo geo-start))
        (asserts! (not (is-eq caller destination)) (err ERR-INVALID-DESTINATION))
        (try! (contract-call? .product-registry get-batch batch-id))  ;; Cross-contract check
        (try! (stx-transfer? (var-get shipment-fee) tx-sender authority))
        (map-set shipments 
            { shipment-id: next-id }
            {
                batch-id: batch-id,
                origin: caller,
                destination: destination,
                start-timestamp: start-timestamp,
                geo-start: geo-start,
                status: "active",
                created-at: block-height
            }
        )
        (var-set last-shipment-id next-id)
        (var-set total-shipments (+ (var-get total-shipments) u1))
        (print { event: "shipment-initiated", id: next-id })
        (ok next-id)
    )
)
(define-public (add-approver (shipment-id uint) (approver principal))
    (let
        (
            (shipment (unwrap! (get-shipment shipment-id) ERR-SHIPMENT-NOT-EXISTS))
            (caller tx-sender)
            (origin (get origin shipment))
            (current-approvers (fold while (lambda (count uint) (+ count u1)) u0 (lambda (i uint) (if (map-get? shipment-approvals { shipment-id: shipment-id, approver-index: i }) (+ count u1) count))))
            (new-index current-approvers)
        )
        (asserts! (is-eq caller origin) (err ERR-UNAUTHORIZED))
        (asserts! (not (is-approval-given shipment-id approver)) (err ERR-APPROVAL-ALREADY-GIVEN))
        (asserts! (<= new-index u10) (err ERR-MAX-APPROVERS-EXCEEDED))
        (map-set shipment-approvals { shipment-id: shipment-id, approver-index: new-index } approver)
        (map-set approvals-given { shipment-id: shipment-id, approver: approver } true)
        (ok true)
    )
)
(define-public (approve-shipment (shipment-id uint))
    (let
        (
            (shipment (unwrap! (get-shipment shipment-id) ERR-SHIPMENT-NOT-EXISTS))
            (caller tx-sender)
            (approvals-count (fold while (lambda (count uint) (+ count u1)) u0 (lambda (i uint) (if (map-get? approvals-given { shipment-id: shipment-id, approver: caller }) (+ count u1) count))))
        )
        (asserts! (is-shipment-active shipment-id) (err ERR-TRANSFER-INVALID))
        (asserts! (not (is-approval-given shipment-id caller)) (err ERR-APPROVAL-ALREADY-GIVEN))
        (map-set approvals-given { shipment-id: shipment-id, approver: caller } true)
        (if (>= approvals-count u2)  ;; Require at least 2 approvals
            (begin
                (map-set shipments 
                    { shipment-id: shipment-id }
                    (merge shipment { status: "in-transit" })
                )
                (print { event: "shipment-approved", id: shipment-id })
                (ok true)
            )
            (ok false)  ;; Pending
        )
    )
)
(define-public (update-shipment-status (shipment-id uint) (new-status (string-ascii 20)) (geo-update (string-ascii 100)))
    (let
        (
            (shipment (unwrap! (get-shipment shipment-id) ERR-SHIPMENT-NOT-EXISTS))
            (caller tx-sender)
            (origin (get origin shipment))
        )
        (asserts! (or (is-eq caller origin) (is-eq caller (get destination shipment))) (err ERR-UNAUTHORIZED))
        (try! (validate-status new-status))
        (try! (validate-geo geo-update))
        (map-set shipments 
            { shipment-id: shipment-id }
            {
                batch-id: (get batch-id shipment),
                origin: (get origin shipment),
                destination: (get destination shipment),
                start-timestamp: (get start-timestamp shipment),
                geo-start: (get geo-start shipment),
                status: new-status,
                created-at: (get created-at shipment)
            }
        )
        (map-set shipment-updates 
            { shipment-id: shipment-id }
            {
                update-geo: geo-update,
                update-timestamp: block-height,
                updater: caller
            }
        )
        (print { event: "shipment-updated", id: shipment-id })
        (ok true)
    )
)
(define-public (complete-shipment (shipment-id uint))
    (let
        (
            (shipment (unwrap! (get-shipment shipment-id) ERR-SHIPMENT-NOT-EXISTS))
            (caller tx-sender)
            (dest (get destination shipment))
        )
        (asserts! (is-eq caller dest) (err ERR-UNAUTHORIZED))
        (asserts! (is-eq (get status shipment) "in-transit") (err ERR-TRANSFER-INVALID))
        (map-set shipments 
            { shipment-id: shipment-id }
            (merge shipment { status: "delivered" })
        )
        (try! (contract-call? .ownership-transfer transfer-ownership (get batch-id shipment) caller))  ;; Cross-contract
        (print { event: "shipment-completed", id: shipment-id })
        (ok true)
    )
)
(define-public (dispute-shipment (shipment-id uint) (reason (string-ascii 200)))
    (let
        (
            (shipment (unwrap! (get-shipment shipment-id) ERR-SHIPMENT-NOT-EXISTS))
            (caller tx-sender)
        )
        (asserts! (or (is-eq caller (get origin shipment)) (is-eq caller (get destination shipment))) (err ERR-UNAUTHORIZED))
        (map-set shipments 
            { shipment-id: shipment-id }
            (merge shipment { status: "disputed" })
        )
        (print { event: "shipment-disputed", id: shipment-id, reason: reason })
        (ok true)
    )
)
(define-read-only (get-shipment-updates (shipment-id uint))
    (map-get? shipment-updates { shipment-id: shipment-id })
)
(define-public (get-shipment-count)
    (ok (var-get last-shipment-id))
)
(define-public (check-shipment-existence (shipment-id uint))
    (ok (is-some (get-shipment shipment-id)))
)
(define-public (get-approval-count (shipment-id uint))
    (ok (fold while (lambda (count uint) (+ count u1)) u0 (lambda (i uint) (if (map-get? approvals-given { shipment-id: shipment-id, approver: tx-sender }) (+ count u1) count))))
)