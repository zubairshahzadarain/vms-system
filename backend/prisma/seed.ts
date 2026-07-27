import { Camera, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@vms.local',
      passwordHash: hash('Admin@123'),
      fullName: 'System Administrator',
      role: Role.ADMIN,
    },
  });

  const operator = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      email: 'operator@vms.local',
      passwordHash: hash('Operator@123'),
      fullName: 'Security Operator',
      role: Role.OPERATOR,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      email: 'viewer@vms.local',
      passwordHash: hash('Viewer@123'),
      fullName: 'Guard Viewer',
      role: Role.VIEWER,
    },
  });

  const entrance = await prisma.cameraGroup.upsert({
    where: { name: 'Main Entrance' },
    update: {},
    create: { name: 'Main Entrance' },
  });
  const parking = await prisma.cameraGroup.upsert({
    where: { name: 'Parking' },
    update: {},
    create: { name: 'Parking' },
  });

  const simHost = process.env.SIMULATOR_HOST || 'simulator';
  const cams = [
    {
      name: 'CAM-01 Lobby',
      location: 'Building A - Lobby',
      rtspUrl: `rtsp://${simHost}:8554/cam1`,
      groupId: entrance.id,
      continuousRecording: true,
      motionDetection: true,
    },
    {
      name: 'CAM-02 Gate',
      location: 'Building A - Main Gate',
      rtspUrl: `rtsp://${simHost}:8554/cam2`,
      groupId: entrance.id,
      continuousRecording: true,
      motionDetection: false,
    },
    {
      name: 'CAM-03 Parking L1',
      location: 'Parking Level 1',
      rtspUrl: `rtsp://${simHost}:8554/cam3`,
      groupId: parking.id,
      continuousRecording: false,
      motionDetection: true,
    },
    {
      name: 'CAM-04 Perimeter',
      location: 'North Perimeter Fence',
      rtspUrl: `rtsp://${simHost}:8554/cam4`,
      groupId: parking.id,
      continuousRecording: false,
      motionDetection: true,
    },
  ];

  const createdCams: Camera[] = [];
  for (const cam of cams) {
    const existing = await prisma.camera.findFirst({ where: { name: cam.name } });
    if (existing) {
      createdCams.push(existing);
    } else {
      createdCams.push(
        await prisma.camera.create({
          data: { ...cam, resolution: '1280x720', fps: 15, isEnabled: true },
        }),
      );
    }
  }

  for (const cam of createdCams.slice(0, 2)) {
    await prisma.cameraAssignment.upsert({
      where: { userId_cameraId: { userId: viewer.id, cameraId: cam.id } },
      update: {},
      create: { userId: viewer.id, cameraId: cam.id },
    });
  }

  console.log('Seed complete:', {
    users: [admin.username, operator.username, viewer.username],
    cameras: createdCams.map((c) => c.name),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
