import { Module } from '@nestjs/common';
import { SchedulingEngineService } from './scheduling-engine.service';

/**
 * Capa reutilizable de agenda.
 * Importar desde VOS AI Health (u otro módulo) y usar SchedulingEngineService:
 *   getAvailability / createAppointment / rescheduleAppointment / cancelAppointment
 * El motor no conoce Patient, Doctor ni conceptos de industria.
 */
@Module({
  providers: [SchedulingEngineService],
  exports: [SchedulingEngineService],
})
export class SchedulingEngineModule {}
