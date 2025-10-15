import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PlanEntity } from '../entities/plan.entity';

@Injectable()
export class PlanRepository {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly repository: Repository<PlanEntity>,
  ) {}

  async create(planData: Partial<PlanEntity>): Promise<PlanEntity> {
    const plan = this.repository.create(planData);
    return this.repository.save(plan);
  }

  async findAll(): Promise<PlanEntity[]> {
    return this.repository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findByStripePriceId(stripePriceId: string): Promise<PlanEntity | null> {
    return this.repository.findOne({ where: { stripePriceId } });
  }

  async findById(id: string): Promise<PlanEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async update(id: string, data: Partial<PlanEntity>): Promise<PlanEntity | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deactivate(id: string): Promise<void> {
    await this.repository.update(id, { isActive: false });
  }

  async upsertByStripePriceId(planData: Partial<PlanEntity>): Promise<PlanEntity> {
    if (!planData.stripePriceId) {
      throw new Error('stripePriceId is required for upsert operation');
    }

    const existing = await this.findByStripePriceId(planData.stripePriceId);
    
    if (existing) {
      await this.repository.update(existing.id, planData);
      const updated = await this.findById(existing.id);
      if (!updated) {
        throw new Error('Failed to retrieve updated plan');
      }
      return updated;
    } else {
      return this.create(planData);
    }
  }
}