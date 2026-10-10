import type { FastifyPluginAsync } from 'fastify';
import { dashboardQuerySchema, dashboardSchema, reportDataSchema, reportRequestSchema, reportFormatSchema, serviceHistorySchema } from '@bcis/shared';
import { z } from 'zod';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { ReportService } from './service.js';

interface Options { database: Database; authService: AuthService }
const error={type:'object',additionalProperties:true} as const; const response={type:'object',additionalProperties:true} as const;
export const reportPlugin:FastifyPluginAsync<Options>=async(app,options)=>{
  const service=new ReportService(options.database); const auth=authenticateWith(options.authService);
  app.get('/dashboard',{preHandler:[auth,requirePermission(options.authService,'dashboard.view')],schema:{response:{200:response,401:error,403:error}}},async request=>dashboardSchema.parse(await service.dashboard(dashboardQuerySchema.parse(request.query))));
  app.get('/reports/data',{preHandler:[auth,requirePermission(options.authService,'report.view')],schema:{response:{200:response,401:error,403:error}}},async request=>reportDataSchema.parse(await service.report(reportRequestSchema.parse(request.query))));
  app.get('/reports/export',{preHandler:[auth,requirePermission(options.authService,'report.export')]},async(request,reply)=>{
    const raw=z.object({report:z.string(),from:z.string(),to:z.string(),subscriberId:z.string().optional(),collectorId:z.string().optional(),format:reportFormatSchema}).parse(request.query); const {format,...reportQuery}=raw; const input=reportRequestSchema.parse(reportQuery); const data=reportDataSchema.parse(await service.report(input)); const buffer=await service.export(data,format);
    const actor=request.authContext?.userId??null; await options.database.db.insert(auditLogs).values({actorUserId:actor,action:'report.exported',entityType:'report',entityId:input.report,reason:format,newValues:{...input,format},requestId:request.id});
    const filename=`bcis-${input.report.toLowerCase().replaceAll('_','-')}-${input.to}.${format.toLowerCase()}`; reply.header('Content-Type',format==='PDF'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition',`attachment; filename="${filename}"`); return reply.send(buffer);
  });
  app.get('/subscribers/:id/service-history',{preHandler:[auth,requirePermission(options.authService,'service.view')],schema:{response:{200:response,401:error,403:error}}},async request=>serviceHistorySchema.parse(await service.history((request.params as {id:string}).id)));
};
