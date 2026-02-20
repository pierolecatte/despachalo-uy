import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Instructions:
// 1. Create a .env.test with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// 2. Run with: vitest run src/__tests__/audit-triggers.test.ts

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!SUPABASE_URL || !SERVICE_KEY)('Audit System Integration', () => {
    let supabase: SupabaseClient
    let testUserId: string
    let testOrgId: string
    let testShipmentId: string

    beforeAll(async () => {
        supabase = createClient(SUPABASE_URL!, SERVICE_KEY!)

        // Setup: Create test user/org if needed, or use existing
        // This requires admin privileges (Service Role)
        const { data: user } = await supabase.auth.admin.createUser({
            email: `audit-test-${Date.now()}@example.com`,
            password: 'password123',
            email_confirm: true
        })
        testUserId = user.user!.id
    })

    afterAll(async () => {
        if (testShipmentId) await supabase.from('shipments').delete().eq('id', testShipmentId)
        if (testUserId) await supabase.auth.admin.deleteUser(testUserId)
    })

    it('should create a shipment_created event and audit log on insert', async () => {
        // ACT: Insert shipment as the test user
        // We simulate the user by using passing the JWT or using a client for that user
        // For audit triggers, it relies on auth.uid(). 
        // We can impersonate:
        const { data: session } = await supabase.auth.signInWithPassword({
            email: `audit-test-${Date.now()}@example.com`, password: 'password123'
        })
        const userClient = createClient(SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            global: { headers: { Authorization: `Bearer ${session.session?.access_token}` } }
        })

        const { data: shipment, error } = await userClient
            .from('shipments')
            .insert({
                tracking_code: `TEST-${Date.now()}`,
                status: 'pendiente',
                recipient_name: 'Test Recipient',
                delivery_type: 'domicilio',
                package_size: 'chico',
                package_count: 1
                // ... required fields
            })
            .select()
            .single()

        expect(error).toBeNull()
        testShipmentId = shipment.id

        // ASSERT: Check shipment_events
        const { data: events } = await supabase
            .from('shipment_events')
            .select('*')
            .eq('shipment_id', shipment.id)
            .eq('event_type', 'shipment_created')

        expect(events).toHaveLength(1)
        expect(events![0].actor_user_id).toBe(testUserId) // Trigger should capture this

        // ASSERT: Check audit.log
        const { data: audits } = await supabase
            .from('audit.log') // Note: need to ensure client can query this schema or use rpc
            .select('*')
            .eq('record_id', shipment.id)
            .eq('table_name', 'shipments')
            .eq('action', 'INSERT')

        // RLS might hide audit.log from anon/user, so we use 'supabase' (admin) client here
        expect(audits).toHaveLength(1)
        expect(audits![0].actor_auth_uid).toBe(testUserId)
    })

    it('should create status_changed event when status updates', async () => {
        // ACT: Update status
        await supabase
            .from('shipments')
            .update({ status: 'levantado' })
            .eq('id', testShipmentId)

        // ASSERT: Check event
        const { data: events } = await supabase
            .from('shipment_events')
            .select('*')
            .eq('shipment_id', testShipmentId)
            .eq('event_type', 'status_changed')

        expect(events).toHaveLength(1)
        expect(events![0].description).toContain('Levantado')
    })
})
