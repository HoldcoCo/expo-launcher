-- The 11 expo apps. Demo usernames and passwords are entered in the launcher, never here.
insert into apps (name, group_name, url, requires_login, sort_order) values
  ('Axiom ERP',              'Axiom',   'https://demo.axiomerp.co/app/',     true,  10),
  ('Axiom Express',          'Axiom',   'https://axiom.axiomerp.co/app/',    true,  20),
  ('Axiom FM',               'Axiom',   'https://axiom.holdco.co/cafm-web',  true,  30),
  ('Axiom FM Team App',      'Axiom',   'https://axiom.holdco.co/cafm',      true,  40),
  ('Axiom FM Client Portal', 'Axiom',   'https://axiom.holdco.co/fm-portal', true,  50),
  ('Axiom ARC',              'Axiom',   'https://demo.axiomerp.co/arc/',     true,  60),
  ('Axiom POS',              'Axiom',   'https://demo.axiomerp.co/pos',      true,  70),
  ('Axiom Axi',              'Axiom',   'https://axiom.holdco.co/app/',      true,  80),
  ('Tecleef',                'Tecleef', 'https://dev.tecleef.com/',          false, 10),
  ('Tecleef Community',      'Tecleef', 'https://dev.tecleef.com/community', true,  20),
  ('Tecleef Commerce',       'Tecleef', 'https://dev.tecleef.com/commerce',  true,  30);
