import type { PrismaClient } from '@graphsign/db';
import type { AuditService } from './audit-service.js';
import { generateId } from '../utils/crypto.js';
import { NotFoundError } from '../utils/errors.js';
import type {
  SearchAgreementsInput,
  SearchTemplatesInput,
  GlobalSearchInput,
  CreateFilterPresetInput,
} from '../validators/search-validators.js';

export interface UserContext {
  userId: string;
  userEmail: string;
  userName?: string;
  organisationId: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Simple Levenshtein distance helper for fuzzy query suggestions (INK-122)
 */
function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1, // deletion
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

export class SearchService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Search and filter agreements with multi-facet queries, RBAC access scoping, and sorting (INK-117, INK-118, INK-119, INK-121, INK-122)
   */
  async searchAgreements(ctx: UserContext, query: SearchAgreementsInput) {
    const startTime = Date.now();
    const keyword = (query.q || query.search || '').trim();
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    // 1. Base Tenant & Deletion Scope (INK-119)
    const where: Record<string, unknown> = {
      organisationId: ctx.organisationId,
      deletedAt: null,
      isArchived: query.isArchived ?? false,
    };

    // 2. RBAC Access Scoping (INK-119, FR-010.007)
    // Non-admins only see documents they authored, are reviewing, or where they are a recipient
    const isAdmin = ctx.role === 'org_admin' || ctx.role === 'admin' || ctx.role === 'super_admin';

    if (!isAdmin && ctx.userId && ctx.userId !== 'unknown') {
      where.OR = [
        { authorId: ctx.userId },
        { reviewerId: ctx.userId },
        { recipients: { some: { email: { equals: ctx.userEmail, mode: 'insensitive' } } } },
      ];
    }

    // 3. Keyword Search (INK-117)
    if (keyword) {
      const keywordConditions: any[] = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        { fileName: { contains: keyword, mode: 'insensitive' } },
        { markdownContent: { contains: keyword, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: keywordConditions }];
        delete where.OR;
      } else {
        where.OR = keywordConditions;
      }
    }

    // 4. Status Filtering (INK-118, INK-271)
    if (query.status && query.status !== 'ALL') {
      if (query.status === 'SIGNED' || query.status === 'COMPLETED') {
        where.status = { in: ['COMPLETED', 'SIGNED'] };
      } else if (query.status === 'ACTIVE') {
        where.status = {
          notIn: ['DRAFT', 'IN_REVIEW', 'REJECTED', 'CANCELLED', 'COMPLETED', 'SIGNED'],
        };
      } else if (query.status === 'DRAFT') {
        where.status = { in: ['DRAFT', 'IN_REVIEW', 'REJECTED', 'CANCELLED'] };
      } else {
        where.status = query.status;
      }
    }

    // 5. Date Range Filtering (INK-118)
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.datePreset) {
      const now = new Date();
      if (query.datePreset === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (query.datePreset === 'last_7_days') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (query.datePreset === 'last_30_days') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (query.datePreset === 'last_90_days') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }
    }

    if (query.startDate) {
      startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      endDate = new Date(query.endDate);
      // If only date provided (YYYY-MM-DD), set to end of day
      if (query.endDate.length === 10) {
        endDate.setHours(23, 59, 59, 999);
      }
    }

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      where.createdAt = dateFilter;
    }

    // 6. Author / Owner Filtering (INK-118)
    if (query.authorId) {
      where.authorId = query.authorId;
    } else if (query.authorEmail) {
      where.author = {
        is: {
          OR: [
            { email: { contains: query.authorEmail, mode: 'insensitive' } },
            { name: { contains: query.authorEmail, mode: 'insensitive' } },
          ],
        },
      };
    }

    // 7. Recipient / Signer Filtering (INK-118)
    if (query.recipientEmail || query.recipientName) {
      const recipientConditions: any[] = [];
      if (query.recipientEmail) {
        recipientConditions.push({
          email: { contains: query.recipientEmail, mode: 'insensitive' },
        });
      }
      if (query.recipientName) {
        recipientConditions.push({ name: { contains: query.recipientName, mode: 'insensitive' } });
      }

      where.recipients = {
        some: recipientConditions.length > 1 ? { OR: recipientConditions } : recipientConditions[0],
      };
    }

    // 8. Tags Filtering (INK-118)
    if (query.tag) {
      where.tags = { array_contains: [query.tag] };
    } else if (query.tags && query.tags.length > 0) {
      where.tags = { array_contains: query.tags };
    }

    // 9. Document Type Filtering (INK-118)
    if (query.documentType && query.documentType !== 'all') {
      if (query.documentType === 'pdf') {
        where.OR = [
          ...(Array.isArray(where.OR) ? where.OR : []),
          { mimeType: 'application/pdf' },
          { fileName: { endsWith: '.pdf', mode: 'insensitive' } },
        ];
      } else if (query.documentType === 'markdown') {
        where.OR = [
          ...(Array.isArray(where.OR) ? where.OR : []),
          { markdownContent: { not: null } },
          { fileName: { endsWith: '.md', mode: 'insensitive' } },
        ];
      } else if (query.documentType === 'docx') {
        where.fileName = { endsWith: '.docx', mode: 'insensitive' };
      }
    }

    // 10. Sorting (INK-121)
    const sortBy = query.sortBy || 'updatedAt';
    const sortOrder = query.sortOrder || 'desc';

    let orderBy: any = { updatedAt: 'desc' };
    if (sortBy === 'title') {
      orderBy = { title: sortOrder };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    } else if (sortBy === 'updatedAt') {
      orderBy = { updatedAt: sortOrder };
    } else if (sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else if (sortBy === 'expiresAt') {
      orderBy = { expiresAt: sortOrder };
    }

    // 11. Execute Database Query
    const [rawItems, total] = await Promise.all([
      this.prisma.agreement.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          organisationId: true,
          authorId: true,
          title: true,
          description: true,
          status: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          markdownContent: true,
          version: true,
          signingOrder: true,
          currentStep: true,
          expiresAt: true,
          isArchived: true,
          tags: true,
          reviewerId: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
          fields: true,
          author: { select: { id: true, name: true, email: true } },
          recipients: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
              routingOrder: true,
              viewedAt: true,
              signedAt: true,
            },
          },
        },
      }),
      this.prisma.agreement.count({ where }),
    ]);

    let items = [...rawItems];

    // Relevance scoring sort when requested (INK-121)
    if (sortBy === 'relevance' && keyword) {
      const lowerKw = keyword.toLowerCase();
      items = items.sort((a, b) => {
        const aTitleMatch = a.title.toLowerCase().includes(lowerKw) ? 2 : 0;
        const bTitleMatch = b.title.toLowerCase().includes(lowerKw) ? 2 : 0;
        const aDescMatch = (a.description || '').toLowerCase().includes(lowerKw) ? 1 : 0;
        const bDescMatch = (b.description || '').toLowerCase().includes(lowerKw) ? 1 : 0;
        const aScore = aTitleMatch + aDescMatch;
        const bScore = bTitleMatch + bDescMatch;
        return bScore - aScore;
      });
    }

    // 12. Fuzzy Suggestion / Did You Mean (INK-122)
    let suggestion: string | null = null;
    if (total === 0 && keyword && keyword.length >= 3) {
      try {
        const candidateTitles = await this.prisma.agreement.findMany({
          where: { organisationId: ctx.organisationId, deletedAt: null },
          select: { title: true },
          take: 50,
        });

        let bestDistance = Infinity;
        let bestCandidate: string | null = null;
        const lowerKw = keyword.toLowerCase();

        for (const cand of candidateTitles) {
          const words = cand.title.toLowerCase().split(/\s+/);
          for (const word of words) {
            const cleanWord = word.replace(/[^a-z0-9]/g, '');
            if (cleanWord.length >= 3) {
              const dist = getLevenshteinDistance(lowerKw, cleanWord);
              if (dist > 0 && dist <= 2 && dist < bestDistance) {
                bestDistance = dist;
                bestCandidate = cleanWord;
              }
            }
          }
        }

        if (bestCandidate) {
          suggestion = bestCandidate;
        }
      } catch {
        // Non-blocking fallback
      }
    }

    const durationMs = Date.now() - startTime;

    // 13. Audit Logging (INK-122, FR-010.010)
    if (this.auditService && keyword) {
      try {
        await this.auditService.log({
          organisationId: ctx.organisationId,
          userId: ctx.userId,
          action: 'SEARCH_EXECUTED',
          resourceType: 'SEARCH',
          resourceId: ctx.userId || '00000000-0000-0000-0000-000000000000',
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          metadata: {
            keyword,
            status: query.status,
            datePreset: query.datePreset,
            totalResults: total,
            durationMs,
          },
        });
      } catch (err) {
        console.error('[SEARCH] Audit logging error:', err);
      }
    }

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      suggestion,
      queryTimeMs: durationMs,
      activeFilters: {
        keyword: keyword || null,
        status: query.status || null,
        datePreset: query.datePreset || null,
        tag: query.tag || null,
        documentType: query.documentType || null,
        sortBy,
        sortOrder,
      },
    };
  }

  /**
   * Search templates library (FR-010.008)
   */
  async searchTemplates(ctx: UserContext, query: SearchTemplatesInput) {
    const startTime = Date.now();
    const keyword = (query.q || query.search || '').trim();
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
      organisationId: ctx.organisationId,
    };

    if (keyword) {
      const keywordConditions = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
      where.OR = keywordConditions;
    }

    if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }

    if (query.isArchived !== undefined) {
      where.isArchived = query.isArchived;
    }

    const sortBy = query.sortBy || 'updatedAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [items, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          organisationId: true,
          title: true,
          description: true,
          version: true,
          isPublished: true,
          isArchived: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Multi-entity unified global search (INK-117, INK-122)
   */
  async searchGlobal(ctx: UserContext, query: GlobalSearchInput) {
    const startTime = Date.now();
    const entityType = query.entityType || 'all';
    const limit = Number(query.limit) || 10;

    let agreements: any[] = [];
    let templates: any[] = [];

    if (entityType === 'all' || entityType === 'agreements') {
      const agRes = await this.searchAgreements(ctx, {
        q: query.q || query.search,
        limit,
        page: 1,
      });
      agreements = agRes.data;
    }

    if (entityType === 'all' || entityType === 'templates') {
      const tmplRes = await this.searchTemplates(ctx, {
        q: query.q || query.search,
        limit,
        page: 1,
      });
      templates = tmplRes.data;
    }

    return {
      agreements,
      templates,
      totalCount: agreements.length + templates.length,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Save user custom filter preset (INK-120)
   */
  async createFilterPreset(ctx: UserContext, input: CreateFilterPresetInput) {
    const id = generateId();

    // If marked as default, unset other defaults for this user & entityType
    if (input.isDefault) {
      await this.prisma.searchFilterPreset.updateMany({
        where: {
          userId: ctx.userId,
          organisationId: ctx.organisationId,
          entityType: input.entityType,
        },
        data: { isDefault: false },
      });
    }

    const preset = await this.prisma.searchFilterPreset.create({
      data: {
        id,
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        name: input.name,
        entityType: input.entityType,
        filters: input.filters as any,
        isDefault: input.isDefault ?? false,
      },
    });

    if (this.auditService) {
      await this.auditService.log({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        action: 'SEARCH_PRESET_CREATED',
        resourceType: 'FILTER_PRESET',
        resourceId: id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { name: input.name, entityType: input.entityType },
      });
    }

    return preset;
  }

  /**
   * List saved filter presets for user (INK-120)
   */
  async listFilterPresets(ctx: UserContext, entityType?: string) {
    const where: Record<string, unknown> = {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
    };

    if (entityType) {
      where.entityType = entityType;
    }

    return this.prisma.searchFilterPreset.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Delete custom filter preset (INK-120)
   */
  async deleteFilterPreset(ctx: UserContext, presetId: string) {
    const preset = await this.prisma.searchFilterPreset.findFirst({
      where: {
        id: presetId,
        userId: ctx.userId,
        organisationId: ctx.organisationId,
      },
    });

    if (!preset) {
      throw new NotFoundError('Filter preset not found or access denied');
    }

    await this.prisma.searchFilterPreset.delete({
      where: { id: presetId },
    });

    if (this.auditService) {
      await this.auditService.log({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        action: 'SEARCH_PRESET_DELETED',
        resourceType: 'FILTER_PRESET',
        resourceId: presetId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }

    return { success: true, message: 'Filter preset deleted' };
  }

  /**
   * Set filter preset as default (INK-120)
   */
  async setDefaultFilterPreset(ctx: UserContext, presetId: string) {
    const preset = await this.prisma.searchFilterPreset.findFirst({
      where: {
        id: presetId,
        userId: ctx.userId,
        organisationId: ctx.organisationId,
      },
    });

    if (!preset) {
      throw new NotFoundError('Filter preset not found');
    }

    // Unset current defaults
    await this.prisma.searchFilterPreset.updateMany({
      where: {
        userId: ctx.userId,
        organisationId: ctx.organisationId,
        entityType: preset.entityType,
      },
      data: { isDefault: false },
    });

    // Set target preset as default
    const updated = await this.prisma.searchFilterPreset.update({
      where: { id: presetId },
      data: { isDefault: true },
    });

    return updated;
  }
}
