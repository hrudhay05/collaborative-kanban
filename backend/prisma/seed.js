import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

async function main() {
  // Clear in child-to-parent order so the seed is re-runnable
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.column.deleteMany();
  await prisma.board.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await bcrypt.hash('Password@123', 10);

  // Organizations
  const abc = await prisma.organization.create({ data: { name: 'ABC Technologies' } });
  const xyz = await prisma.organization.create({ data: { name: 'XYZ Solutions' } });

  // Tenants (branches)
  const mkTenant = (org, name) =>
    prisma.tenant.create({ data: { organizationId: org.id, name } });
  const hyd = await mkTenant(abc, 'Hyderabad');
  const blr = await mkTenant(abc, 'Bangalore');
  await mkTenant(abc, 'Chennai');
  const mum = await mkTenant(xyz, 'Mumbai');
  await mkTenant(xyz, 'Pune');

  // Users
  const mkUser = (name, email) =>
    prisma.user.create({ data: { name, email, passwordHash } });
  const rahul = await mkUser('Rahul Sharma', 'rahul@abc.com');
  const priya = await mkUser('Priya Reddy', 'priya@abc.com');
  const arjun = await mkUser('Arjun Kumar', 'arjun@abc.com');
  const sneha = await mkUser('Sneha Iyer', 'sneha@abc.com');
  const kiran = await mkUser('Kiran Patel', 'kiran@xyz.com');

  // Memberships (rahul has tenantId null = org-level admin)
  const mkMember = (user, org, tenant, role) =>
    prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        tenantId: tenant ? tenant.id : null,
        role,
      },
    });
  await mkMember(rahul, abc, null, 'ORG_ADMIN');
  await mkMember(priya, abc, hyd, 'TENANT_ADMIN');
  await mkMember(arjun, abc, hyd, 'MEMBER');
  await mkMember(sneha, abc, blr, 'TENANT_ADMIN');
  await mkMember(kiran, xyz, mum, 'MEMBER');

  // Boards and their tasks
  // task = [title, columnIndex (0 To Do, 1 In Progress, 2 Testing, 3 Done), priority, assignee, dueInDays]
  const boardDefs = [
    {
      name: 'Website Development',
      description: 'Company website redesign',
      org: abc, tenant: hyd, creator: priya,
      tasks: [
        ['Design homepage mockups', 3, 'HIGH', arjun, -2],
        ['Build responsive navbar', 1, 'MEDIUM', arjun, 3],
        ['Set up contact form', 0, 'LOW', priya, 7],
        ['Fix footer layout bug', 2, 'MEDIUM', arjun, 2],
        ['Write SEO meta tags', 0, 'LOW', null, null],
      ],
    },
    {
      name: 'Mobile Application Development',
      description: 'Customer mobile app',
      org: abc, tenant: hyd, creator: priya,
      tasks: [
        ['Login screen UI', 1, 'HIGH', arjun, 4],
        ['Push notification setup', 0, 'MEDIUM', priya, 10],
        ['Offline sync research', 0, 'LOW', null, null],
        ['App icon and splash screen', 3, 'LOW', arjun, -5],
      ],
    },
    {
      name: 'CRM Development',
      description: 'Internal CRM system',
      org: abc, tenant: blr, creator: sneha,
      tasks: [
        ['Customer table schema', 3, 'HIGH', sneha, -3],
        ['Lead import from CSV', 1, 'MEDIUM', sneha, 5],
        ['Email templates', 0, 'LOW', null, null],
      ],
    },
    {
      name: 'AI Automation',
      description: 'Automating repetitive workflows',
      org: abc, tenant: blr, creator: sneha,
      tasks: [
        ['Collect training data', 1, 'HIGH', sneha, 6],
        ['Ticket classifier prototype', 0, 'MEDIUM', sneha, 14],
        ['Evaluate model accuracy', 2, 'MEDIUM', null, 9],
      ],
    },
    {
      name: 'Customer Support Platform',
      description: 'Helpdesk and ticketing',
      org: xyz, tenant: mum, creator: kiran,
      tasks: [
        ['Ticket submission form', 2, 'HIGH', kiran, 1],
        ['Agent dashboard', 1, 'MEDIUM', kiran, 8],
        ['SLA timer logic', 0, 'LOW', null, null],
      ],
    },
  ];

  const columnNames = ['To Do', 'In Progress', 'Testing', 'Done'];

  for (const def of boardDefs) {
    const board = await prisma.board.create({
      data: {
        organizationId: def.org.id,
        tenantId: def.tenant.id,
        name: def.name,
        description: def.description,
        createdBy: def.creator.id,
      },
    });

    const columns = [];
    for (let i = 0; i < columnNames.length; i++) {
      columns.push(
        await prisma.column.create({
          data: {
            boardId: board.id,
            tenantId: def.tenant.id,
            name: columnNames[i],
            position: i,
          },
        })
      );
    }

    // Per-column counter; positions use gaps of 1000 so inserts between are easy later
    const counters = [0, 0, 0, 0];
    for (const [title, colIdx, priority, assignee, due] of def.tasks) {
      counters[colIdx] += 1;
      const task = await prisma.task.create({
        data: {
          boardId: board.id,
          columnId: columns[colIdx].id,
          tenantId: def.tenant.id,
          title,
          description: `Details for: ${title}`,
          assignedTo: assignee ? assignee.id : null,
          priority,
          dueDate: due === null ? null : daysFromNow(due),
          position: counters[colIdx] * 1000,
        },
      });

      await prisma.activityLog.create({
        data: {
          tenantId: def.tenant.id,
          userId: def.creator.id,
          entityType: 'TASK',
          entityId: task.id,
          action: 'CREATED',
          details: { title, board: def.name, column: columnNames[colIdx] },
        },
      });
    }
  }

  const counts = {
    Organization: await prisma.organization.count(),
    Tenant: await prisma.tenant.count(),
    User: await prisma.user.count(),
    Membership: await prisma.membership.count(),
    Board: await prisma.board.count(),
    Column: await prisma.column.count(),
    Task: await prisma.task.count(),
    ActivityLog: await prisma.activityLog.count(),
  };
  console.log('Seed complete. Row counts:');
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });