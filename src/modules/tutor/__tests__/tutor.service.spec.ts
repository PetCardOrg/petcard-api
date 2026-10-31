import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { TutorService } from '../tutor.service';

const BUCKET = 'https://bucket.s3.us-east-1.amazonaws.com';

describe('TutorService: fotos que deixam de ser usadas (AUD API-10)', () => {
  let service: TutorService;
  let prisma: {
    tutor: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    pet: { findMany: jest.Mock };
  };
  let uploadService: { assertBucketUrl: jest.Mock; discardFile: jest.Mock };

  const tutor = {
    id: 'tutor-1',
    name: 'Maria',
    email: 'maria@example.com',
    password: 'hash',
    phone: null,
    profileImageUrl: `${BUCKET}/tutors/antiga.png`,
    googleId: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tutor: {
        findUnique: jest.fn().mockResolvedValue(tutor),
        update: jest.fn().mockResolvedValue(tutor),
        delete: jest.fn().mockResolvedValue(tutor),
      },
      pet: { findMany: jest.fn().mockResolvedValue([]) },
    };
    uploadService = {
      assertBucketUrl: jest.fn(),
      discardFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: uploadService },
      ],
    }).compile();

    service = module.get(TutorService);
  });

  it('apaga a foto de perfil antiga quando ela muda', async () => {
    await service.updateById('tutor-1', {
      profile_image_url: `${BUCKET}/tutors/nova.png`,
    });

    expect(uploadService.discardFile).toHaveBeenCalledWith(
      `${BUCKET}/tutors/antiga.png`,
    );
  });

  it('não apaga a foto quando ela não vem no corpo', async () => {
    await service.updateById('tutor-1', { name: 'Maria Souza' });

    expect(uploadService.discardFile).not.toHaveBeenCalled();
  });

  it('ao excluir a conta, apaga a foto de perfil e as dos pets (que saem em cascata)', async () => {
    prisma.pet.findMany.mockResolvedValue([
      { photoUrl: `${BUCKET}/pets/rex.png` },
      { photoUrl: null },
    ]);

    await service.removeById('tutor-1');

    expect(prisma.tutor.delete).toHaveBeenCalledWith({
      where: { id: 'tutor-1' },
    });
    expect(uploadService.discardFile).toHaveBeenCalledWith(
      `${BUCKET}/tutors/antiga.png`,
    );
    expect(uploadService.discardFile).toHaveBeenCalledWith(
      `${BUCKET}/pets/rex.png`,
    );
  });
});
